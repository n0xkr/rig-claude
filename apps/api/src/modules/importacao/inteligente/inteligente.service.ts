import {
  statusViagemDeTexto,
  type ImportacaoInteligenteInput,
  type ImportacaoInteligenteResultado,
  type StatusViagem,
  type TipoAbaImportacao,
  type ViagemCargaInput,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../../config/supabase.js';
import { logger } from '../../../config/logger.js';
import { fetchAllPages } from '../../../lib/fetchAllPages.js';
import { writeAuditLog } from '../../../lib/auditLog.js';
import { isSchemaAusente } from '../../../lib/permissoes.js';
import { erroMigration0014 } from '../../../lib/schemaPendente.js';
import { pgErrorToProblem } from '../../../lib/pgErrors.js';
import { normTexto } from '../../iaSolicitacoes/leitura.js';
import { ehAuxiliar, ehExtraConhecido, mapearColunas } from './dicionario.js';
import { padronizarAba, validarVolume } from './padronizacao.js';
import { DomainError } from '../../../lib/errors.js';
import {
  camposLivres,
  classificarAba,
  descreverColunas,
  lerRegistros,
  vazio,
  type AbaLida,
  type TipoDados,
} from './interpretacao.js';
import { classificarAbaComIa, iaDisponivel, mapearColunasComIa, statusComIa } from './ia.js';
import { consolidar, contar, type BaseExistente, type Plano, type Row } from './consolidacao.js';

const LOTE = 50;

function msgErro(err: unknown): string {
  const pg = pgErrorToProblem(err);
  if (pg) return pg.detail;
  return (err as { message?: string } | null)?.message ?? 'Falha ao gravar';
}

async function tabelaExiste(tabela: string, coluna = 'id'): Promise<boolean> {
  const { error } = await supabaseAdmin.from(tabela).select(coluna).limit(1);
  return !error || !isSchemaAusente(error);
}

async function carregarBase(): Promise<BaseExistente> {
  const [veiculos, motoristas, viagens] = await Promise.all([
    fetchAllPages<Row>((a, b) => supabaseAdmin.from('veiculos').select('*').is('deleted_at', null).order('id').range(a, b)),
    fetchAllPages<Row>((a, b) => supabaseAdmin.from('motoristas').select('*').is('deleted_at', null).order('id').range(a, b)),
    fetchAllPages<Row>((a, b) =>
      supabaseAdmin.from('viagens').select('*').is('deleted_at', null).order('id', { ascending: false }).range(a, b),
    ),
  ]);
  let clientes: Row[] | null = null;
  if (await tabelaExiste('clientes')) {
    clientes = await fetchAllPages<Row>((a, b) =>
      supabaseAdmin.from('clientes').select('*').is('deleted_at', null).order('id').range(a, b),
    ).catch(() => null);
  }
  const cargasPorViagem = new Map<string, ViagemCargaInput[]>();
  const { data: cargas, error } = await supabaseAdmin.from('viagem_cargas').select('*').limit(20000);
  if (!error)
    for (const c of (cargas ?? []) as Array<ViagemCargaInput & { viagem_id: string }>) {
      const { viagem_id, ...resto } = c as unknown as Row & { viagem_id: string };
      delete resto.id;
      delete resto.created_at;
      delete resto.updated_at;
      cargasPorViagem.set(viagem_id, [...(cargasPorViagem.get(viagem_id) ?? []), resto as unknown as ViagemCargaInput]);
    }
  return { veiculos, motoristas, clientes, viagens, cargasPorViagem };
}

/**
 * Etapas 1 e 2 (sem banco): padroniza cada aba, descobre o que ela é, lê os registros e traduz
 * os textos de status. Separado de `executar` para poder rodar offline (scripts/testes).
 */
export async function interpretarArquivos(
  input: Pick<ImportacaoInteligenteInput, 'arquivos'>,
): Promise<{ abas: AbaLida[]; avisos: string[]; statusIa: Map<string, StatusViagem> }> {
  const abas: AbaLida[] = [];
  const avisos: string[] = [];

  // 1. O que é cada aba e o que significa cada coluna.
  const excesso = validarVolume(input.arquivos);
  if (excesso) throw new DomainError('Importação grande demais', 413, excesso);
  for (const arq of input.arquivos) {
    for (const abaBruta of arq.abas) {
      // Etapa 1: tratamento e padronização de todas as células (ver padronizacao.ts).
      const padr = padronizarAba(abaBruta);
      const aba = { nome: padr.nome };
      const cabecalhos = padr.cabecalhos;
      const linhas = padr.linhas as Array<Record<string, unknown>>;
      const base = { nome: padr.nome, cabecalhos, linhas };
      let cls = classificarAba(base);
      let origemTipo: 'dicionario' | 'ia' | 'nome' = cls?.origem ?? 'dicionario';
      if (!cls && linhas.length > 0 && cabecalhos.length > 1) {
        const tipoIa = await classificarAbaComIa(aba.nome, cabecalhos, linhas.slice(0, 3));
        if (tipoIa) {
          cls = { tipo: tipoIa, mapa: tipoIa === 'ignorada' ? null : mapearColunas(tipoIa, cabecalhos), origem: 'dicionario' };
          origemTipo = 'ia';
        }
      }
      const tipo: TipoAbaImportacao = cls?.tipo ?? 'ignorada';
      const porColuna = new Map(cls?.mapa?.porColuna ?? []);
      const daIa = new Set<string>();
      if (tipo !== 'ignorada' && linhas.length > 0) {
        const semCampo = cabecalhos.filter(
          (col) =>
            !porColuna.has(col) &&
            !ehAuxiliar(col) &&
            !(tipo === 'viagens' && ehExtraConhecido(col)) &&
            linhas.some((l) => !vazio(l[col])),
        );
        if (semCampo.length > 0) {
          const livres = camposLivres(tipo, new Set(porColuna.values()));
          const sugestoes = await mapearColunasComIa(
            aba.nome,
            semCampo.map((coluna) => ({
              coluna,
              exemplos: [...new Set(linhas.map((l) => l[coluna]).filter((v) => !vazio(v)).map((v) => String(v).slice(0, 60)))].slice(0, 5),
            })),
            livres,
          );
          for (const [col, campo] of sugestoes) {
            porColuna.set(col, campo);
            daIa.add(col);
          }
        }
      }
      const registros = tipo === 'ignorada' ? [] : lerRegistros(arq.nome, base, tipo as TipoDados, porColuna);
      abas.push({
        tipo,
        registros,
        info: {
          arquivo: arq.nome,
          aba: aba.nome,
          tipo,
          origemTipo,
          linhas: linhas.length,
          colunas: descreverColunas(tipo, cabecalhos, porColuna, daIa).map((c) => {
            const p = padr.colunas.find((x) => x.coluna === c.coluna);
            return p
              ? {
                  ...c,
                  tipo: p.tipo,
                  formato: p.formato,
                  preenchidas: p.preenchidas,
                  distintos: p.distintos,
                  exemplos: p.exemplos,
                  convertidas: p.convertidas,
                  inconsistencias: p.inconsistencias,
                  exemplosInconsistencia: p.exemplosInconsistencia,
                }
              : c;
          }),
          descartadas: padr.descartadas.slice(0, 200),
          duplicadas: padr.duplicadas,
          observacao:
            tipo === 'ignorada'
              ? linhas.length === 0
                ? 'Aba vazia.'
                : 'Não contém registros operacionais (instruções, painel, listas ou dados sem uso no sistema).'
              : undefined,
        },
      });
    }
  }

  // 2. Textos de status que as regras não entendem: a IA traduz (uma chamada para todos).
  const naoEntendidos = new Set<string>();
  for (const a of abas)
    if (a.tipo === 'viagens')
      for (const r of a.registros) {
        // Só vai para a IA o que nenhuma regra entende em nenhum dos textos da linha.
        const ts = [r.campos.status_texto, r.campos.localizacao, r.campos.observacoes, r.campos.cliente];
        if (ts.some((t) => typeof t === 'string' && statusViagemDeTexto(t))) continue;
        for (const t of [r.campos.status_texto, r.campos.observacoes])
          if (typeof t === 'string') naoEntendidos.add(t);
      }
  const statusIa: Map<string, StatusViagem> = await statusComIa([...naoEntendidos]);
  if (naoEntendidos.size > 0 && statusIa.size < naoEntendidos.size)
    avisos.push(
      `${naoEntendidos.size - statusIa.size} texto(s) de status não puderam ser traduzidos para uma etapa: a viagem mantém o status atual (o texto fica nas informações extras).`,
    );
  return { abas, avisos, statusIa };
}

/**
 * Importação inteligente (ver `ImportacaoInteligenteInputSchema`): lê todas as
 * abas de todos os arquivos, entende cada uma sozinha, cruza as informações e
 * grava o resultado consolidado. Em `previa` nada é gravado.
 */
export class ImportacaoInteligenteService {
  async executar(
    input: ImportacaoInteligenteInput,
    userId: string | null,
    ip: string | null,
  ): Promise<ImportacaoInteligenteResultado> {
    const { abas, avisos, statusIa } = await interpretarArquivos(input);

    // 3. Cruzamento com o banco.
    const base = await carregarBase();
    const plano = consolidar(abas, base, statusIa);

    const rotuloCampos = (d: Row) =>
      Object.keys(d)
        .map((k) => (k === 'dados_extras' ? 'informações extras' : k.replace(/_/g, ' ')))
        .join(', ');
    for (const [nome, lista] of [
      ['Veículo', plano.veiculos],
      ['Motorista', plano.motoristas],
      ['Cliente', plano.clientes],
    ] as const) {
      const at = lista.filter((x) => x.acao === 'atualizar');
      at.slice(0, 15).forEach((x) =>
        avisos.push(
          `${nome} ${String(x.existente?.placa ?? x.existente?.nome_completo ?? x.existente?.nome ?? x.ref)} será atualizado: ${rotuloCampos(x.dados)}.`,
        ),
      );
      if (at.length > 15) avisos.push(`… e mais ${at.length - 15} ${nome.toLowerCase()}(s) atualizados.`);
    }

    let loteId: string | null = null;
    if (input.modo === 'gravar') loteId = await this.gravar(plano, input, userId, ip);

    return {
      modo: input.modo,
      lote_id: loteId,
      ia_disponivel: iaDisponivel(),
      abas: abas.map((a) => a.info),
      totais: {
        viagens: contar(plano.viagens, plano.erros.filter((e) => /viagem/i.test(e.mensagem)).length),
        veiculos: contar(plano.veiculos),
        motoristas: contar(plano.motoristas),
        clientes: contar(plano.clientes),
        cargas: {
          novos: plano.viagens.reduce((s, v) => s + (v.cargasMudaram ? v.cargas.length : 0), 0),
          atualizados: 0,
          iguais: plano.viagens.reduce((s, v) => s + (v.cargasMudaram ? 0 : v.cargas.length), 0),
          erros: 0,
        },
      },
      cruzamentos: plano.cruzamentos,
      viagens: plano.viagens.slice(0, 500).map((v) => v.previa),
      erros: plano.erros.slice(0, 300),
      avisos: [...avisos, ...plano.avisos].slice(0, 200),
    };
  }

  // -------------------------------------------------------------------------------
  private async gravar(
    plano: Plano,
    input: ImportacaoInteligenteInput,
    userId: string | null,
    ip: string | null,
  ): Promise<string | null> {
    // Colunas novas de viagens (migration 0014) são necessárias para gravar viagens.
    if (plano.viagens.length > 0) {
      const { error } = await supabaseAdmin.from('viagens').select('codigo_externo').limit(1);
      if (error && isSchemaAusente(error)) throw erroMigration0014();
      if (!(await tabelaExiste('viagem_cargas'))) throw erroMigration0014();
    }
    const nomeLote = `[Importação inteligente] ${input.arquivos.map((a) => a.nome).join(', ')}`.slice(0, 250);
    const erro = (aba: string, mensagem: string) => plano.erros.push({ arquivo: '', aba, linha: null, mensagem });

    // ----- clientes
    for (const c of plano.clientes) {
      try {
        if (c.acao === 'criar') {
          const { error } = await supabaseAdmin.from('clientes').insert(c.dados);
          if (error) throw error;
        } else if (c.acao === 'atualizar' && c.existente) {
          const { error } = await supabaseAdmin.from('clientes').update(c.dados).eq('id', c.existente.id as string);
          if (error) throw error;
        }
      } catch (err) {
        erro('clientes', `Cliente ${String(c.dados.nome ?? c.existente?.nome ?? '')}: ${msgErro(err)}`);
      }
    }

    // ----- motoristas (ids novos são necessários para as viagens)
    const motoristaId = new Map<string, string>();
    for (const m of plano.motoristas) {
      try {
        if (m.acao === 'criar') {
          const { data, error } = await supabaseAdmin.from('motoristas').insert(m.dados).select('id').single();
          if (error) throw error;
          motoristaId.set(m.ref, (data as { id: string }).id);
        } else if (m.acao === 'atualizar' && m.existente) {
          const { error } = await supabaseAdmin.from('motoristas').update(m.dados).eq('id', m.existente.id as string);
          if (error) throw error;
        }
      } catch (err) {
        erro('motoristas', `Motorista ${String(m.dados.nome_completo ?? m.existente?.nome_completo ?? '')}: ${msgErro(err)}`);
      }
    }
    const resolverMotorista = (ref: string | null): string | null => {
      if (!ref) return null;
      if (ref.startsWith('id:')) return ref.slice(3);
      return motoristaId.get(ref) ?? null;
    };

    // ----- veículos (placa_cavalo das viagens é FK para veiculos.placa)
    const veiculoId = new Map<string, string>();
    for (const v of plano.veiculos) {
      try {
        if (v.acao === 'criar') {
          const { data, error } = await supabaseAdmin.from('veiculos').insert(v.dados).select('id, placa').single();
          if (error) throw error;
          veiculoId.set(v.ref, (data as { id: string }).id);
        } else if (v.acao === 'atualizar' && v.existente) {
          const { error } = await supabaseAdmin.from('veiculos').update(v.dados).eq('id', v.existente.id as string);
          if (error) throw error;
        }
      } catch (err) {
        erro('veiculos', `Veículo ${v.ref}: ${msgErro(err)}`);
      }
    }
    const { data: todosVeiculos } = await supabaseAdmin.from('veiculos').select('id, placa').is('deleted_at', null).limit(10000);
    for (const v of (todosVeiculos ?? []) as Array<{ id: string; placa: string }>) veiculoId.set(v.placa.toUpperCase(), v.id);

    // ----- viagens
    for (const pv of plano.viagens) {
      if (pv.acao === 'igual') continue;
      const onde = pv.fontes[0] ?? 'viagens';
      try {
        const row: Row = { ...pv.dados };
        const mid = resolverMotorista(pv.motoristaRef);
        if (mid && mid !== pv.motoristaAnteriorId) row.motorista_id = mid;
        else delete row.motorista_id;
        const placa = String(row.placa_cavalo ?? pv.existente?.placa_cavalo ?? '');
        if (veiculoId.has(placa) && (!pv.existente || !pv.existente.veiculo_id)) row.veiculo_id = veiculoId.get(placa);

        let viagemId: string;
        if (pv.acao === 'criar') {
          const { data, error } = await supabaseAdmin
            .from('viagens')
            .insert({ ...row, created_by: userId })
            .select('id, status, motorista_id')
            .single();
          if (error) throw error;
          viagemId = (data as { id: string }).id;
          await supabaseAdmin.from('status_viagem_historico').insert({
            viagem_id: viagemId,
            status_anterior: null,
            status_novo: (row.status as string) ?? 'PROGRAMADA',
            changed_by: userId,
            observacoes: `[Importação] ${onde}`,
            origem_evento: 'MANUAL',
          });
        } else {
          viagemId = String(pv.existente!.id);
          if (Object.keys(row).length > 0) {
            const { error } = await supabaseAdmin.from('viagens').update(row).eq('id', viagemId);
            if (error) throw error;
          }
          if (row.status && row.status !== pv.statusAnterior)
            await supabaseAdmin.from('status_viagem_historico').insert({
              viagem_id: viagemId,
              status_anterior: pv.statusAnterior,
              status_novo: row.status,
              changed_by: userId,
              observacoes: `[Importação] status atualizado pela planilha — ${onde}`,
              origem_evento: 'MANUAL',
            });
        }
        if (row.motorista_id)
          await supabaseAdmin.from('viagem_motorista_historico').insert({
            viagem_id: viagemId,
            motorista_anterior_id: pv.motoristaAnteriorId,
            motorista_novo_id: row.motorista_id,
            motivo: pv.motoristaAnteriorId ? `Atualizado pela importação — ${onde}` : 'Motorista inicial (importação)',
            changed_by: userId,
          });
        if (pv.cargasMudaram) {
          await supabaseAdmin.from('viagem_cargas').delete().eq('viagem_id', viagemId);
          for (let i = 0; i < pv.cargas.length; i += LOTE) {
            const { error } = await supabaseAdmin
              .from('viagem_cargas')
              .insert(pv.cargas.slice(i, i + LOTE).map((c) => ({ ...c, viagem_id: viagemId })));
            if (error) throw error;
          }
        }
      } catch (err) {
        plano.erros.push({ arquivo: '', aba: onde, linha: null, mensagem: `Viagem ${pv.previa.chave}: ${msgErro(err)}` });
        pv.previa.acao = 'igual';
      }
    }

    // ----- lote (histórico de importações) + auditoria
    const total = plano.viagens.length + plano.veiculos.length + plano.motoristas.length + plano.clientes.length;
    let loteId: string | null = null;
    const { data: lote, error: loteErr } = await supabaseAdmin
      .from('import_datasets')
      .insert({
        nome: nomeLote,
        target: 'importacao_inteligente',
        origem: input.arquivos.some((a) => /\.csv$/i.test(a.nome)) ? 'CSV' : 'EXCEL',
        total_linhas: total,
        linhas_importadas: Math.max(0, total - plano.erros.length),
        linhas_com_erro: plano.erros.length,
        status: 'IMPORTADO',
        created_by: userId,
      })
      .select('id')
      .single();
    if (loteErr) logger.warn({ loteErr }, 'Não foi possível registrar o lote da importação inteligente');
    else loteId = (lote as { id: string }).id;
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'import_datasets',
      entityId: loteId,
      changes: {
        modo: 'importacao_inteligente',
        arquivos: input.arquivos.map((a) => ({ nome: a.nome, abas: a.abas.map((x) => normTexto(x.nome)) })),
        viagens: contar(plano.viagens),
        veiculos: contar(plano.veiculos),
        motoristas: contar(plano.motoristas),
        clientes: contar(plano.clientes),
        erros: plano.erros.length,
      },
      ip,
    });
    return loteId;
  }
}
