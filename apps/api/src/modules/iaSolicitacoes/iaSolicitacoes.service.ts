import type {
  AnalisarAbaInput,
  AnalisarAbaResult,
  IaSolicitacao,
  ImportDataset,
  ListarSolicitacoesQuery,
  ResponderSolicitacaoInput,
  ResultadoDecisao,
  ResumoSolicitacoes,
} from '@rigabras/shared';
import { RESPOSTA_EXTRA, RESPOSTA_IGNORAR } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { DomainError, NotFoundError } from '../../lib/errors.js';
import { pgErrorToProblem } from '../../lib/pgErrors.js';
import { writeAuditLog } from '../../lib/auditLog.js';
import { ENTIDADES, type EntidadeDef, type PerguntaCampo } from './entidades.js';
import { Contexto, analisarAba } from './analisador.js';
import { IaSolicitacoesRepository, type Row } from './iaSolicitacoes.repository.js';
import { normTexto } from './leitura.js';

const ENTIDADES_COM_TABELA = new Set(Object.keys(ENTIDADES));

function mensagemDeErro(err: unknown): string {
  if (err instanceof DomainError) return err.detail ?? err.message;
  const pg = pgErrorToProblem(err);
  if (pg) return pg.detail;
  const e = err as { message?: string } | null;
  return e?.message ?? 'Falha ao gravar o registro';
}

/**
 * Regra de ouro: NADA entra nas tabelas de negócio sem uma decisão humana. Este
 * serviço só cria solicitações na importação (`analisarAba`) e só grava um
 * cadastro quando o administrador aprova ou responde a pergunta.
 */
export class IaSolicitacoesService {
  constructor(private readonly repo: IaSolicitacoesRepository = new IaSolicitacoesRepository()) {}

  // ----- lote de importação ----------------------------------------------------
  async criarLote(nome: string, origem: 'EXCEL' | 'CSV', userId: string, ip: string | null): Promise<ImportDataset> {
    const { data, error } = await supabaseAdmin
      .from('import_datasets')
      .insert({ nome, target: 'planilha_ia', origem, created_by: userId, status: 'VALIDADO' })
      .select('*')
      .single();
    if (error) throw error;
    const dataset = data as ImportDataset;
    await writeAuditLog({ userId, action: 'CREATE', entity: 'import_datasets', entityId: dataset.id, changes: { nome, origem, modo: 'planilha_ia' }, ip });
    return dataset;
  }

  private async obterLote(id: string): Promise<ImportDataset> {
    const { data, error } = await supabaseAdmin.from('import_datasets').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    const d = data as unknown as (Omit<ImportDataset, 'target'> & { target: string }) | null;
    if (!d || d.target !== 'planilha_ia') throw new NotFoundError('Lote de importação', id);
    return d as unknown as ImportDataset;
  }

  async analisarAba(datasetId: string, input: AnalisarAbaInput): Promise<AnalisarAbaResult> {
    await this.obterLote(datasetId);
    return analisarAba(this.repo, datasetId, input);
  }

  async concluirLote(datasetId: string): Promise<ImportDataset> {
    await this.obterLote(datasetId);
    const total = await this.repo.contarPorDataset(datasetId);
    const { data, error } = await supabaseAdmin
      .from('import_datasets')
      .update({ total_linhas: total, linhas_importadas: 0, linhas_com_erro: 0, status: 'VALIDADO' })
      .eq('id', datasetId)
      .select('*')
      .single();
    if (error) throw error;
    return data as ImportDataset;
  }

  // ----- consulta ----------------------------------------------------------------
  async listar(query: ListarSolicitacoesQuery) {
    const r = await this.repo.listar(query);
    return { ...r, data: r.data.map((s) => this.comRotulos(s)) };
  }

  /** Acrescenta os rótulos reais dos campos (a tela não precisa adivinhar "cnh_validade" -> "CNH validade"). */
  private comRotulos(s: IaSolicitacao): IaSolicitacao {
    if (!ENTIDADES_COM_TABELA.has(s.entidade)) return s;
    const def = ENTIDADES[s.entidade as keyof typeof ENTIDADES];
    const rotulos: Record<string, string> = { dados_extras: 'Outras informações da planilha' };
    for (const [k, c] of Object.entries(def.campos)) rotulos[k] = c.label;
    return { ...s, rotulos_campos: rotulos };
  }

  resumo(): Promise<ResumoSolicitacoes> {
    return this.repo.resumo();
  }

  private async obterOuFalhar(id: string): Promise<IaSolicitacao> {
    const s = await this.repo.obter(id);
    if (!s) throw new NotFoundError('Solicitação', id);
    return s;
  }

  private exigirAberta(s: IaSolicitacao): void {
    if (s.status !== 'PENDENTE' && s.status !== 'ERRO') {
      throw new DomainError('Solicitação já decidida', 409, `Esta solicitação já está ${s.status.toLowerCase()}`);
    }
  }

  // ----- gravação nos cadastros ---------------------------------------------------
  private async gravar(
    def: EntidadeDef,
    s: IaSolicitacao,
    dados: Row,
    ctx: Contexto,
  ): Promise<{ id: string; acao: 'criado' | 'atualizado'; campos: Row }> {
    const { dados_extras: extras, ...campos } = dados;
    const extrasObj = extras && typeof extras === 'object' && Object.keys(extras as Row).length > 0 ? (extras as Row) : null;

    if (s.tipo === 'ATUALIZACAO') {
      const id = String((s.evidencia as Row | null)?.registro_id ?? '');
      if (!id) throw new DomainError('Solicitação de atualização sem registro de origem', 422);
      const patch: Row = { ...campos, ...(extrasObj ? { dados_extras: extrasObj } : {}) };
      if (def.entidade === 'rastreadores' && typeof campos.placa === 'string') {
        const v = await this.repo.veiculoIdPorPlaca(campos.placa);
        if (v) patch.veiculo_id = v;
      }
      await this.repo.atualizarRegistro(def.tabela, id, patch);
      return { id, acao: 'atualizado', campos: patch };
    }

    const erro = def.validar(campos);
    if (erro) throw new DomainError(erro, 422);
    const indice = await ctx.indice(def);
    const ja = indice.achar(campos);
    if (ja) {
      throw new DomainError(
        'Registro já cadastrado',
        409,
        `Já existe um ${def.rotulo.toLowerCase()} correspondente (id ${String(ja.id)}). Recuse este pedido; se a planilha traz dados novos, a próxima importação gerará uma atualização.`,
      );
    }
    let row: Row = def.completarParaGravar ? def.completarParaGravar(campos) : { ...campos };
    if (extrasObj) row.dados_extras = extrasObj;
    if (def.entidade === 'rastreadores' && typeof row.placa === 'string') {
      const v = await this.repo.veiculoIdPorPlaca(row.placa);
      if (v) row = { ...row, veiculo_id: v };
    }
    const id = await this.repo.inserirRegistro(def.tabela, row);
    indice.adicionar({ ...row, id });
    return { id, acao: 'criado', campos: row };
  }

  private definicao(s: IaSolicitacao): EntidadeDef {
    if (!ENTIDADES_COM_TABELA.has(s.entidade)) throw new DomainError('Solicitação sem cadastro associado', 422);
    return ENTIDADES[s.entidade as keyof typeof ENTIDADES];
  }

  // ----- decisões ------------------------------------------------------------------
  async aprovar(id: string, userId: string, ip: string | null, ctx: Contexto = new Contexto(this.repo)): Promise<IaSolicitacao> {
    const s = await this.obterOuFalhar(id);
    if (s.tipo === 'PERGUNTA') throw new DomainError('Esta solicitação é uma pergunta', 422, 'Perguntas são respondidas, não aprovadas');
    this.exigirAberta(s);
    const def = this.definicao(s);
    try {
      const r = await this.gravar(def, s, (s.dados_propostos ?? {}) as Row, ctx);
      await writeAuditLog({
        userId,
        action: r.acao === 'criado' ? 'CREATE' : 'UPDATE',
        entity: def.tabela,
        entityId: r.id,
        changes: { via: 'solicitacao_ia', solicitacao_id: s.id, aprovada_por: userId, dados: r.campos },
        ip,
      });
      return await this.repo.atualizar(id, {
        status: 'APROVADA',
        erro: null,
        registro_id: r.id,
        decidido_por: userId,
        decidido_em: new Date().toISOString(),
      });
    } catch (err) {
      return this.repo.atualizar(id, { status: 'ERRO', erro: mensagemDeErro(err) });
    }
  }

  async aprovarLote(ids: string[], userId: string, ip: string | null): Promise<ResultadoDecisao[]> {
    const ctx = new Contexto(this.repo);
    const resultados: ResultadoDecisao[] = [];
    for (const id of ids) {
      try {
        const s = await this.aprovar(id, userId, ip, ctx);
        resultados.push({ id, ok: s.status === 'APROVADA', status: s.status, ...(s.erro ? { erro: s.erro } : {}) });
      } catch (err) {
        resultados.push({ id, ok: false, status: 'PENDENTE', erro: mensagemDeErro(err) });
      }
    }
    return resultados;
  }

  async recusar(id: string, motivo: string | undefined, userId: string, ip: string | null): Promise<IaSolicitacao> {
    const s = await this.obterOuFalhar(id);
    this.exigirAberta(s);
    const r = await this.repo.atualizar(id, {
      status: 'RECUSADA',
      erro: null,
      resposta: motivo ? { motivo } : null,
      decidido_por: userId,
      decidido_em: new Date().toISOString(),
    });
    await writeAuditLog({ userId, action: 'UPDATE', entity: 'ia_solicitacoes', entityId: id, changes: { decisao: 'RECUSADA', motivo: motivo ?? null }, ip });
    return r;
  }

  async responder(id: string, input: ResponderSolicitacaoInput, userId: string, ip: string | null): Promise<IaSolicitacao> {
    const s = await this.obterOuFalhar(id);
    if (s.tipo !== 'PERGUNTA') throw new DomainError('Esta solicitação não é uma pergunta', 422, 'Use aprovar/recusar');
    this.exigirAberta(s);
    const quando = new Date().toISOString();
    const decisao = { decidido_por: userId, decidido_em: quando };

    const opcoesValidas = new Set((s.opcoes ?? []).map((o) => o.valor));
    if (s.entrada === 'OPCAO') {
      if (!input.opcao || !opcoesValidas.has(input.opcao)) {
        throw new DomainError('Resposta inválida', 422, 'Escolha uma das opções oferecidas');
      }
    } else if (!input.texto && input.opcao !== RESPOSTA_IGNORAR) {
      throw new DomainError('Resposta inválida', 422, 'Informe a resposta em texto');
    }

    // Perguntas sobre a estrutura da planilha: viram conhecimento reaproveitado nas próximas importações.
    if (s.entidade === 'planilha') {
      await this.repo.salvarConhecimento({ aba_norm: normTexto(s.aba), coluna_norm: '', entidade: input.opcao!, destino: input.opcao! }, userId);
      await writeAuditLog({ userId, action: 'CREATE', entity: 'ia_conhecimento', entityId: null, changes: { aba: s.aba, resposta: input.opcao }, ip });
      return this.repo.atualizar(id, {
        status: 'RESPONDIDA',
        erro: null,
        resposta: { opcao: input.opcao, nota: 'Resposta salva. Reenvie a planilha para aplicá-la.' },
        ...decisao,
      });
    }
    if (s.entidade === 'coluna') {
      const alvo = String((s.evidencia as Row | null)?.entidade_alvo ?? '');
      await this.repo.salvarConhecimento(
        { aba_norm: normTexto(s.aba), coluna_norm: normTexto(s.coluna), entidade: alvo, destino: input.opcao! },
        userId,
      );
      await writeAuditLog({ userId, action: 'CREATE', entity: 'ia_conhecimento', entityId: null, changes: { aba: s.aba, coluna: s.coluna, resposta: input.opcao }, ip });
      return this.repo.atualizar(id, {
        status: 'RESPONDIDA',
        erro: null,
        resposta: { opcao: input.opcao, nota: 'Resposta salva. Reenvie a planilha para aplicá-la.' },
        ...decisao,
      });
    }

    // Pergunta sobre um registro que ainda vai ser criado.
    if (input.opcao === RESPOSTA_IGNORAR) {
      return this.repo.atualizar(id, { status: 'RESPONDIDA', erro: null, resposta: { opcao: RESPOSTA_IGNORAR }, ...decisao });
    }
    const def = this.definicao(s);
    const campo = s.campo_pergunta;
    if (!campo || !def.campos[campo]) throw new DomainError('Pergunta sem campo associado', 422);
    const dados: Row = { ...((s.dados_propostos ?? {}) as Row) };
    if (input.opcao !== RESPOSTA_EXTRA) dados[campo] = s.entrada === 'TEXTO' ? input.texto : input.opcao;
    const resposta = { [s.entrada === 'TEXTO' ? 'texto' : 'opcao']: s.entrada === 'TEXTO' ? input.texto : input.opcao };

    const restantes = (((s.evidencia as Row | null)?.perguntas_restantes ?? []) as PerguntaCampo[]).filter(Boolean);
    if (restantes.length > 0) {
      // Ainda há outra dúvida sobre o mesmo registro: guarda a resposta e abre a próxima pergunta.
      const [prox, ...resto] = restantes;
      await this.repo.inserir([
        {
          dataset_id: s.dataset_id ?? null,
          tipo: 'PERGUNTA',
          entidade: s.entidade,
          titulo: `${def.rotulo}: ${s.chave_natural} — dúvida sobre "${def.campos[prox!.campo]?.label ?? prox!.campo}"`,
          descricao: s.descricao ?? null,
          aba: s.aba ?? null,
          linha: s.linha ?? null,
          pergunta: prox!.pergunta,
          campo_pergunta: prox!.campo,
          entrada: prox!.entrada,
          opcoes: prox!.opcoes,
          dados_propostos: dados,
          evidencia: { ...((s.evidencia as Row | null) ?? {}), perguntas_restantes: resto },
          chave_natural: s.chave_natural ?? null,
          chave_dedup: `p:${s.entidade}:${s.chave_natural}:${prox!.campo}`,
        },
      ]);
      return this.repo.atualizar(id, { status: 'RESPONDIDA', erro: null, resposta: { ...resposta, proxima_pergunta: true }, ...decisao });
    }

    try {
      const ctx = new Contexto(this.repo);
      const r = await this.gravar(def, { ...s, tipo: 'CADASTRO' }, dados, ctx);
      await writeAuditLog({
        userId,
        action: 'CREATE',
        entity: def.tabela,
        entityId: r.id,
        changes: { via: 'solicitacao_ia', solicitacao_id: s.id, respondida_por: userId, dados: r.campos },
        ip,
      });
      return await this.repo.atualizar(id, {
        status: 'RESPONDIDA',
        erro: null,
        registro_id: r.id,
        resposta,
        ...decisao,
      });
    } catch (err) {
      return this.repo.atualizar(id, { status: 'ERRO', erro: mensagemDeErro(err), resposta });
    }
  }
}
