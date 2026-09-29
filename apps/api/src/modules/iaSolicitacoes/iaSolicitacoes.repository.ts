import type { IaSolicitacao, ListarSolicitacoesQuery, ResumoSolicitacoes } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { fetchAllPages } from '../../lib/fetchAllPages.js';

export type Row = Record<string, unknown>;

export interface NovaSolicitacao {
  dataset_id: string | null;
  tipo: 'CADASTRO' | 'ATUALIZACAO' | 'PERGUNTA';
  entidade: string;
  titulo: string;
  descricao?: string | null;
  aba?: string | null;
  linha?: number | null;
  coluna?: string | null;
  chave_natural?: string | null;
  dados_propostos?: Row | null;
  dados_atuais?: Row | null;
  evidencia?: Row | null;
  pergunta?: string | null;
  campo_pergunta?: string | null;
  entrada?: 'OPCAO' | 'TEXTO' | null;
  opcoes?: Array<{ valor: string; rotulo: string }> | null;
  sugestao_ia?: Row | null;
  chave_dedup: string;
}

export interface ConhecimentoRow {
  aba_norm: string;
  coluna_norm: string;
  entidade: string;
  destino: string;
}

const T = 'ia_solicitacoes';
const CHUNK_IN = 50;
const CHUNK_INSERT = 200;

function pedacos<X>(lista: X[], n: number): X[][] {
  const r: X[][] = [];
  for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n));
  return r;
}

const codigoPg = (e: unknown) => (e as { code?: string } | null)?.code;

export class IaSolicitacoesRepository {
  // ----- cadastros (tabelas de negócio) -------------------------------------
  /** Todas as linhas não excluídas de uma tabela de cadastro (tabelas pequenas: frota, motoristas, clientes...). */
  async carregarCadastro(tabela: string): Promise<Row[]> {
    return fetchAllPages<Row>((from, to) =>
      supabaseAdmin
        .from(tabela)
        .select('*')
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to),
    );
  }

  async inserirRegistro(tabela: string, row: Row): Promise<string> {
    const { data, error } = await supabaseAdmin.from(tabela).insert(row).select('id').single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async atualizarRegistro(tabela: string, id: string, patch: Row): Promise<void> {
    const { error } = await supabaseAdmin.from(tabela).update(patch).eq('id', id);
    if (error) throw error;
  }

  async veiculoIdPorPlaca(placa: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from('veiculos')
      .select('id')
      .eq('placa', placa)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  }

  // ----- solicitações --------------------------------------------------------
  /** Quais `chave_dedup` já existem (qualquer status exceto ERRO): reimportar a mesma planilha não repete nem os pedidos recusados. */
  async dedupExistentes(chaves: string[]): Promise<Set<string>> {
    const achadas = new Set<string>();
    for (const parte of pedacos(chaves, CHUNK_IN)) {
      const { data, error } = await supabaseAdmin
        .from(T)
        .select('chave_dedup')
        .in('chave_dedup', parte)
        .neq('status', 'ERRO');
      if (error) throw error;
      for (const r of (data ?? []) as Array<{ chave_dedup: string }>) achadas.add(r.chave_dedup);
    }
    return achadas;
  }

  /** `chave_natural` já vista (qualquer status exceto ERRO) para uma entidade — evita pedir/perguntar de novo o mesmo veículo/motorista/cliente. */
  async chavesNaturaisConhecidas(entidade: string, chaves: string[]): Promise<Set<string>> {
    const achadas = new Set<string>();
    for (const parte of pedacos(chaves, CHUNK_IN)) {
      const { data, error } = await supabaseAdmin
        .from(T)
        .select('chave_natural')
        .eq('entidade', entidade)
        .in('chave_natural', parte)
        .neq('status', 'ERRO');
      if (error) throw error;
      for (const r of (data ?? []) as Array<{ chave_natural: string | null }>)
        if (r.chave_natural) achadas.add(r.chave_natural);
    }
    return achadas;
  }

  /** Insere em lotes; duplicata por corrida (índice único) é contada e ignorada. */
  async inserir(rows: NovaSolicitacao[]): Promise<{ inseridas: number; duplicadas: number }> {
    let inseridas = 0;
    let duplicadas = 0;
    for (const parte of pedacos(rows, CHUNK_INSERT)) {
      const { error } = await supabaseAdmin.from(T).insert(parte);
      if (!error) {
        inseridas += parte.length;
        continue;
      }
      if (codigoPg(error) !== '23505') throw error;
      // Alguma duplicata por corrida: refaz uma a uma.
      for (const r of parte) {
        const um = await supabaseAdmin.from(T).insert(r);
        if (!um.error) inseridas++;
        else if (codigoPg(um.error) === '23505') duplicadas++;
        else throw um.error;
      }
    }
    return { inseridas, duplicadas };
  }

  async obter(id: string): Promise<IaSolicitacao | null> {
    const { data, error } = await supabaseAdmin.from(T).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as IaSolicitacao | null) ?? null;
  }

  async atualizar(id: string, patch: Row): Promise<IaSolicitacao> {
    const { data, error } = await supabaseAdmin
      .from(T)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as IaSolicitacao;
  }

  async listar(
    f: ListarSolicitacoesQuery,
  ): Promise<{ data: IaSolicitacao[]; nextCursor: string | null }> {
    let q = supabaseAdmin
      .from(T)
      .select('*')
      .order('id', { ascending: false })
      .limit(f.limit + 1);
    if (f.status) q = q.eq('status', f.status);
    if (f.excluirStatus) q = q.neq('status', f.excluirStatus);
    if (f.tipo) q = q.eq('tipo', f.tipo);
    if (f.entidade) q = q.eq('entidade', f.entidade);
    if (f.datasetId) q = q.eq('dataset_id', f.datasetId);
    if (f.cursor) q = q.lt('id', f.cursor);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as IaSolicitacao[];
    const hasMore = rows.length > f.limit;
    const page = hasMore ? rows.slice(0, f.limit) : rows;
    return { data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async contarPorDataset(datasetId: string): Promise<number> {
    const rows = await fetchAllPages<{ id: string }>((from, to) =>
      supabaseAdmin
        .from(T)
        .select('id')
        .eq('dataset_id', datasetId)
        .order('id', { ascending: true })
        .range(from, to),
    );
    return rows.length;
  }

  async resumo(): Promise<ResumoSolicitacoes> {
    const rows = await fetchAllPages<{ tipo: string; status: string }>((from, to) =>
      supabaseAdmin
        .from(T)
        .select('tipo, status')
        .in('status', ['PENDENTE', 'ERRO'])
        .order('id', { ascending: true })
        .range(from, to),
    );
    const r: ResumoSolicitacoes = {
      pendentes: 0,
      perguntas: 0,
      cadastros: 0,
      atualizacoes: 0,
      erros: 0,
    };
    for (const x of rows) {
      if (x.status === 'ERRO') {
        r.erros++;
        continue;
      }
      r.pendentes++;
      if (x.tipo === 'PERGUNTA') r.perguntas++;
      else if (x.tipo === 'CADASTRO') r.cadastros++;
      else r.atualizacoes++;
    }
    return r;
  }

  // ----- conhecimento aprendido ---------------------------------------------
  async conhecimento(): Promise<ConhecimentoRow[]> {
    const { data, error } = await supabaseAdmin
      .from('ia_conhecimento')
      .select('aba_norm, coluna_norm, entidade, destino');
    if (error) throw error;
    return (data ?? []) as ConhecimentoRow[];
  }

  async salvarConhecimento(k: ConhecimentoRow, userId: string | null): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('ia_conhecimento')
      .select('id')
      .eq('aba_norm', k.aba_norm)
      .eq('coluna_norm', k.coluna_norm)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const up = await supabaseAdmin
        .from('ia_conhecimento')
        .update({ entidade: k.entidade, destino: k.destino, respondido_por: userId })
        .eq('id', (data as { id: string }).id);
      if (up.error) throw up.error;
      return;
    }
    const ins = await supabaseAdmin
      .from('ia_conhecimento')
      .insert({ ...k, respondido_por: userId });
    if (ins.error) throw ins.error;
  }
}
