import { supabaseAdmin } from '../../config/supabase.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { writeAuditLog } from '../../lib/auditLog.js';
import { DomainError } from '../../lib/errors.js';
import { pgErrorToProblem } from '../../lib/pgErrors.js';

/**
 * Gerenciador de dados do SUPERADMIN: listar, criar, editar e excluir registros de QUALQUER
 * tabela de negócio, sem passar pelas regras de fluxo dos módulos (status de frete, veículo em
 * viagem, estoque...). Só tabelas desta lista; usuários/categorias têm tela própria e a trilha
 * de auditoria é somente leitura.
 */
export const TABELAS: Array<{ tabela: string; rotulo: string; grupo: string }> = [
  { tabela: 'viagens', rotulo: 'Viagens', grupo: 'Operação' },
  { tabela: 'viagem_cargas', rotulo: 'Cargas das viagens (CRT/DANFE)', grupo: 'Operação' },
  {
    tabela: 'status_viagem_historico',
    rotulo: 'Histórico de status das viagens',
    grupo: 'Operação',
  },
  {
    tabela: 'viagem_motorista_historico',
    rotulo: 'Histórico de motorista das viagens',
    grupo: 'Operação',
  },
  { tabela: 'eventos_risco', rotulo: 'Eventos de risco', grupo: 'Operação' },
  { tabela: 'redes', rotulo: 'Redes de contenção (WMS)', grupo: 'WMS' },
  { tabela: 'rede_movimentacoes', rotulo: 'Movimentações de redes', grupo: 'WMS' },
  { tabela: 'documentos_embarque', rotulo: 'Documentos de embarque', grupo: 'Operação' },
  { tabela: 'eventos_fronteira', rotulo: 'Eventos de fronteira', grupo: 'Operação' },
  { tabela: 'validacoes_pre_embarque', rotulo: 'Validações pré-embarque', grupo: 'Operação' },
  { tabela: 'veiculos', rotulo: 'Veículos (frota)', grupo: 'Cadastros' },
  { tabela: 'motoristas', rotulo: 'Motoristas', grupo: 'Cadastros' },
  { tabela: 'motorista_documentos', rotulo: 'Documentos dos motoristas', grupo: 'Cadastros' },
  { tabela: 'clientes', rotulo: 'Clientes', grupo: 'Cadastros' },
  { tabela: 'rastreadores', rotulo: 'Rastreadores', grupo: 'Cadastros' },
  { tabela: 'pontos_apoio', rotulo: 'Pontos de apoio', grupo: 'Cadastros' },
  { tabela: 'apolices_seguro', rotulo: 'Apólices de seguro', grupo: 'Cadastros' },
  { tabela: 'fretes', rotulo: 'Fretes', grupo: 'Financeiro' },
  { tabela: 'frete_lancamentos', rotulo: 'Lançamentos de frete', grupo: 'Financeiro' },
  { tabela: 'pagamentos_frete', rotulo: 'Pagamentos de frete', grupo: 'Financeiro' },
  {
    tabela: 'status_frete_historico',
    rotulo: 'Histórico de status dos fretes',
    grupo: 'Financeiro',
  },
  { tabela: 'manutencoes_veiculo', rotulo: 'Manutenções', grupo: 'Frota e jornada' },
  { tabela: 'registros_jornada', rotulo: 'Registros de jornada', grupo: 'Frota e jornada' },
  { tabela: 'armazens', rotulo: 'Armazéns', grupo: 'WMS' },
  { tabela: 'depositantes', rotulo: 'Depositantes', grupo: 'WMS' },
  { tabela: 'produtos_armazenados', rotulo: 'Produtos', grupo: 'WMS' },
  { tabela: 'enderecos_armazem', rotulo: 'Endereços do armazém', grupo: 'WMS' },
  { tabela: 'estoque', rotulo: 'Estoque', grupo: 'WMS' },
  { tabela: 'movimentacoes_estoque', rotulo: 'Movimentações de estoque', grupo: 'WMS' },
  { tabela: 'recebimentos', rotulo: 'Recebimentos', grupo: 'WMS' },
  { tabela: 'recebimento_itens', rotulo: 'Itens de recebimento', grupo: 'WMS' },
  { tabela: 'expedicoes', rotulo: 'Expedições', grupo: 'WMS' },
  { tabela: 'expedicao_itens', rotulo: 'Itens de expedição', grupo: 'WMS' },
  { tabela: 'inventarios', rotulo: 'Inventários', grupo: 'WMS' },
  { tabela: 'inventario_itens', rotulo: 'Itens de inventário', grupo: 'WMS' },
  { tabela: 'avarias', rotulo: 'Avarias', grupo: 'WMS' },
  { tabela: 'portaria_entradas', rotulo: 'Entradas da portaria', grupo: 'Portaria' },
  { tabela: 'portaria_documentos', rotulo: 'Documentos da portaria', grupo: 'Portaria' },
  { tabela: 'portaria_saidas', rotulo: 'Saídas da portaria', grupo: 'Portaria' },
  { tabela: 'ordens_servico', rotulo: 'Ordens de serviço', grupo: 'Portaria' },
  { tabela: 'import_datasets', rotulo: 'Lotes de importação', grupo: 'Importação e IA' },
  { tabela: 'ia_solicitacoes', rotulo: 'Solicitações da IA', grupo: 'Importação e IA' },
  { tabela: 'ia_conhecimento', rotulo: 'Respostas aprendidas pela IA', grupo: 'Importação e IA' },
  {
    tabela: 'campos_personalizados',
    rotulo: 'Campos criados pelas planilhas',
    grupo: 'Importação e IA',
  },
];
const PERMITIDAS = new Set(TABELAS.map((t) => t.tabela));

export interface ColunaMeta {
  nome: string;
  /** string | integer | number | boolean | array | object */
  tipo: string;
  /** uuid, date, timestamp with time zone, jsonb, text, nome do enum... */
  formato: string | null;
  obrigatoria: boolean;
  temPadrao: boolean;
  opcoes: string[] | null;
  /** "Note: This is a Foreign Key to `veiculos.id`" -> "veiculos.id" */
  referencia: string | null;
}

type Row = Record<string, unknown>;

function exigirTabela(tabela: string) {
  if (!PERMITIDAS.has(tabela))
    throw new DomainError('Tabela não permitida', 404, `"${tabela}" não é gerenciável aqui.`);
}

function falha(err: unknown): never {
  const pg = pgErrorToProblem(err);
  if (pg) throw new DomainError(pg.title, pg.status, pg.detail);
  const msg = (err as { message?: string } | null)?.message ?? 'Falha no banco de dados';
  throw new DomainError('Falha no banco de dados', 422, msg);
}

// ---- metadados das colunas (OpenAPI do PostgREST, com cache) ---------------------------------
let cacheMeta: { em: number; defs: Record<string, ColunaMeta[]> } | null = null;

async function metadadosDoBanco(): Promise<Record<string, ColunaMeta[]> | null> {
  if (cacheMeta && Date.now() - cacheMeta.em < 5 * 60_000) return cacheMeta.defs;
  if (env.USE_FAKE_DB) return null;
  try {
    const resp = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/openapi+json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const doc = (await resp.json()) as {
      definitions?: Record<string, { required?: string[]; properties?: Record<string, Row> }>;
    };
    const defs: Record<string, ColunaMeta[]> = {};
    for (const [tabela, def] of Object.entries(doc.definitions ?? {})) {
      const req = new Set(def.required ?? []);
      defs[tabela] = Object.entries(def.properties ?? {}).map(([nome, p]) => ({
        nome,
        tipo: String(p.type ?? 'string'),
        formato: typeof p.format === 'string' ? p.format : null,
        obrigatoria: req.has(nome),
        temPadrao: p.default !== undefined,
        opcoes: Array.isArray(p.enum) ? (p.enum as string[]) : null,
        referencia: /Foreign Key to `([^`]+)`/.exec(String(p.description ?? ''))?.[1] ?? null,
      }));
    }
    cacheMeta = { em: Date.now(), defs };
    return defs;
  } catch (err) {
    logger.warn({ err }, 'Não foi possível ler o esquema do banco (OpenAPI do PostgREST)');
    return null;
  }
}

/** Sem o esquema (banco falso de testes): deduz as colunas dos próprios registros. */
function colunasDasLinhas(linhas: Row[]): ColunaMeta[] {
  const nomes = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
  return nomes.map((nome) => {
    const v = linhas.map((l) => l[nome]).find((x) => x !== null && x !== undefined);
    const tipo =
      typeof v === 'number'
        ? 'number'
        : typeof v === 'boolean'
          ? 'boolean'
          : v && typeof v === 'object'
            ? 'object'
            : 'string';
    return {
      nome,
      tipo,
      formato: tipo === 'object' ? 'jsonb' : null,
      obrigatoria: false,
      temPadrao: nome === 'id' || nome === 'created_at',
      opcoes: null,
      referencia: null,
    };
  });
}

export async function colunasDe(tabela: string): Promise<ColunaMeta[]> {
  exigirTabela(tabela);
  const defs = await metadadosDoBanco();
  if (defs) {
    const c = defs[tabela];
    if (!c)
      throw new DomainError(
        'Tabela inexistente',
        404,
        `A tabela "${tabela}" não existe neste banco (migration pendente?).`,
      );
    return c;
  }
  const { data } = await supabaseAdmin.from(tabela).select('*').limit(50);
  return colunasDasLinhas((data ?? []) as Row[]);
}

/** Valor digitado no formulário -> valor da coluna ("" = vazio, "12,5" = 12.5, JSON em texto). */
function converter(valor: unknown, col: ColunaMeta | undefined): unknown {
  if (valor === undefined) return undefined;
  if (valor === '' || valor === null) return null;
  if (!col) return valor;
  const fmt = col.formato ?? '';
  if (typeof valor === 'string') {
    const t = valor.trim();
    if (col.tipo === 'integer' || col.tipo === 'number') {
      const n = Number(
        t
          .replace(/\s/g, '')
          .replace(/\.(?=\d{3}(\D|$))/g, '')
          .replace(',', '.'),
      );
      if (!Number.isFinite(n))
        throw new DomainError('Valor inválido', 422, `"${col.nome}" precisa ser um número.`);
      return col.tipo === 'integer' ? Math.round(n) : n;
    }
    if (col.tipo === 'boolean') return /^(true|sim|s|1)$/i.test(t);
    if (col.tipo === 'array' || col.tipo === 'object' || /json/.test(fmt)) {
      try {
        return JSON.parse(t);
      } catch {
        if (col.tipo === 'array')
          return t
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        throw new DomainError('Valor inválido', 422, `"${col.nome}" precisa ser JSON válido.`);
      }
    }
  }
  return valor;
}

function prepararDados(dados: Row, colunas: ColunaMeta[], criando: boolean): Row {
  const porNome = new Map(colunas.map((c) => [c.nome, c]));
  const out: Row = Object.create(null);
  for (const [k, v] of Object.entries(dados)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (porNome.size > 0 && !porNome.has(k))
      throw new DomainError('Coluna inexistente', 422, `A coluna "${k}" não existe.`);
    if (!criando && (k === 'id' || k === 'created_at')) continue;
    const c = converter(v, porNome.get(k));
    if (c === undefined) continue;
    // Na criação, campo vazio com valor padrão no banco fica de fora (o banco preenche).
    if (criando && c === null && porNome.get(k)?.temPadrao) continue;
    out[k] = c;
  }
  return { ...out };
}

const escaparBusca = (q: string) => q.replace(/[,()*%\\]/g, ' ').trim();

export class AdminDadosService {
  async tabelas() {
    const defs = await metadadosDoBanco();
    return TABELAS.filter((t) => !defs || defs[t.tabela]);
  }

  async listar(
    tabela: string,
    opts: { q?: string; pagina: number; porPagina: number; excluidos: boolean },
  ) {
    const colunas = await colunasDe(tabela);
    const nomes = new Set(colunas.map((c) => c.nome));
    let query = supabaseAdmin.from(tabela).select('*', { count: 'exact' });
    if (nomes.has('deleted_at'))
      query = opts.excluidos ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
    const q = escaparBusca(opts.q ?? '');
    if (q) {
      if (/^[0-9a-f-]{36}$/i.test(q)) query = query.eq('id', q);
      else {
        const textos = colunas.filter(
          (c) =>
            c.tipo === 'string' && (!c.formato || /^(text|character varying)$/.test(c.formato)),
        );
        if (textos.length > 0)
          query = query.or(textos.map((c) => `${c.nome}.ilike.*${q}*`).join(','));
      }
    }
    const ordem = nomes.has('created_at') ? 'created_at' : nomes.has('id') ? 'id' : null;
    if (ordem) query = query.order(ordem, { ascending: false });
    const ini = (opts.pagina - 1) * opts.porPagina;
    const { data, error, count } = await query.range(ini, ini + opts.porPagina - 1);
    if (error) falha(error);
    const linhas = (data ?? []) as Row[];
    return {
      data: linhas,
      total: count ?? linhas.length,
      colunas: colunas.length ? colunas : colunasDasLinhas(linhas),
    };
  }

  async criar(tabela: string, dados: Row, userId: string, ip: string | null) {
    const colunas = await colunasDe(tabela);
    const row = prepararDados(dados, colunas, true);
    const { data, error } = await supabaseAdmin.from(tabela).insert(row).select('*').single();
    if (error) falha(error);
    const criado = data as Row;
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: tabela,
      entityId: String(criado.id ?? ''),
      changes: { via: 'gerenciador de dados', dados: row },
      ip,
    });
    return criado;
  }

  async atualizar(tabela: string, id: string, dados: Row, userId: string, ip: string | null) {
    const colunas = await colunasDe(tabela);
    const row = prepararDados(dados, colunas, false);
    if (Object.keys(row).length === 0)
      throw new DomainError('Nada para salvar', 400, 'Nenhuma coluna alterada.');
    const { data: antes } = await supabaseAdmin.from(tabela).select('*').eq('id', id).maybeSingle();
    if (!antes)
      throw new DomainError('Registro não encontrado', 404, `Nenhum registro ${id} em ${tabela}.`);
    const { data, error } = await supabaseAdmin
      .from(tabela)
      .update(row)
      .eq('id', id)
      .select('*')
      .single();
    if (error) falha(error);
    const anterior = Object.fromEntries(Object.keys(row).map((k) => [k, (antes as Row)[k]]));
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: tabela,
      entityId: id,
      changes: { via: 'gerenciador de dados', antes: anterior, depois: row },
      ip,
    });
    return data as Row;
  }

  /** Exclui: tabela com `deleted_at` vai para a lixeira (restaurável); `definitivo` apaga de vez. */
  async excluir(
    tabela: string,
    id: string,
    definitivo: boolean,
    userId: string,
    ip: string | null,
  ) {
    const colunas = await colunasDe(tabela);
    const { data: antes } = await supabaseAdmin.from(tabela).select('*').eq('id', id).maybeSingle();
    if (!antes)
      throw new DomainError('Registro não encontrado', 404, `Nenhum registro ${id} em ${tabela}.`);
    const lixeira = !definitivo && colunas.some((c) => c.nome === 'deleted_at');
    const { error } = lixeira
      ? await supabaseAdmin
          .from(tabela)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id)
      : await supabaseAdmin.from(tabela).delete().eq('id', id);
    if (error) {
      if ((error as { code?: string }).code === '23503')
        throw new DomainError(
          'Registro em uso',
          409,
          'Outros registros ainda apontam para este. Exclua-os antes (ou mande para a lixeira em vez de apagar de vez).',
        );
      falha(error);
    }
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: tabela,
      entityId: id,
      changes: { via: 'gerenciador de dados', definitivo: !lixeira, registro: antes as Row },
      ip,
    });
    return { lixeira };
  }
}
