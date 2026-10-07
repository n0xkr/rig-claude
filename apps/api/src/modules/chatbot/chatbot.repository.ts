import { supabaseAdmin } from '../../config/supabase.js';

export interface ViagensPorStatus {
  total: number;
  porStatus: Record<string, number>;
}

export interface FretesPendentes {
  quantidade: number;
  valorTotal: number;
}

export interface VeiculoNoPatio {
  placaCavalo: string;
  minutosNoPatio: number;
}

/**
 * Consultas cruas (contagens/somas em memória, mesmo padrão já usado pelos
 * KPIs de fronteira/frota/WMS deste projeto) que alimentam o snapshot do
 * chatbot. Cada método aqui é uma pergunta operacional literal do documento
 * de evolução (seção 14) — nunca um cálculo especulativo.
 */
export class ChatbotRepository {
  async getViagensPorStatus(): Promise<ViagensPorStatus> {
    const { data, error } = await supabaseAdmin
      .from('viagens')
      .select('status')
      .is('deleted_at', null);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ status: string }>;
    const porStatus: Record<string, number> = {};
    for (const row of rows) {
      porStatus[row.status] = (porStatus[row.status] ?? 0) + 1;
    }
    return { total: rows.length, porStatus };
  }

  async getFretesPendentesAprovacao(): Promise<FretesPendentes> {
    const { data, error } = await supabaseAdmin
      .from('fretes')
      .select('valor_contratado')
      .eq('status_fechamento', 'EM_CONFERENCIA')
      .is('deleted_at', null);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ valor_contratado: number }>;
    return {
      quantidade: rows.length,
      valorTotal: rows.reduce((acc, r) => acc + Number(r.valor_contratado ?? 0), 0),
    };
  }

  /** Veículo com maior tempo contínuo no pátio (aguardando descarga/saída) — critério "qual veículo está há mais tempo no pátio". */
  async getVeiculoComMaisTempoNoPatio(): Promise<VeiculoNoPatio | null> {
    const { data, error } = await supabaseAdmin
      .from('portaria_entradas')
      .select('placa_cavalo, data_entrada, status')
      .in('status', ['LIBERADO_PATIO', 'AGUARDANDO_SAIDA', 'CONFERIDO', 'AGUARDANDO_CONFERENCIA'])
      .is('deleted_at', null)
      .order('data_entrada', { ascending: true })
      .limit(1);
    if (error) throw error;
    const row = (data ?? [])[0] as { placa_cavalo: string; data_entrada: string } | undefined;
    if (!row) return null;
    const minutos = Math.round((Date.now() - new Date(row.data_entrada).getTime()) / 60000);
    return { placaCavalo: row.placa_cavalo, minutosNoPatio: minutos };
  }

  async countDocumentacaoPendente(): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from('viagens')
      .select('id')
      .in('status', ['CARREGADO_AGUARDANDO_DOCUMENTOS', 'EM_DOCUMENTACAO'])
      .is('deleted_at', null);
    if (error) throw error;
    return (data ?? []).length;
  }

  /**
   * Resumo dos eventos de risco lançados (contagens por status/severidade +
   * os 10 mais recentes) — alimenta a fonte "riscos" do snapshot da IA.
   */
  async getEventosRiscoResumo(): Promise<{
    total: number;
    porStatus: Record<string, number>;
    porSeveridade: Record<string, number>;
    ultimos: Array<{ tipo: string; severidade: string; status: string; descricao: string }>;
  }> {
    const { data, error } = await supabaseAdmin
      .from('eventos_risco')
      .select('tipo, severidade, status, descricao, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      tipo: string;
      severidade: string;
      status: string;
      descricao: string | null;
    }>;
    const porStatus: Record<string, number> = {};
    const porSeveridade: Record<string, number> = {};
    for (const row of rows) {
      porStatus[row.status] = (porStatus[row.status] ?? 0) + 1;
      porSeveridade[row.severidade] = (porSeveridade[row.severidade] ?? 0) + 1;
    }
    return {
      total: rows.length,
      porStatus,
      porSeveridade,
      ultimos: rows.slice(0, 10).map((r) => ({
        tipo: r.tipo,
        severidade: r.severidade,
        status: r.status,
        descricao: r.descricao ?? '',
      })),
    };
  }

  /**
   * Contagem de linhas de uma tabela (PostgREST devolve `count` exato; o
   * banco fake em memória não, daí o fallback `data.length` com range largo —
   * mesmo padrão de `adminDados.listar`).
   */
  async contarTabela(tabela: string): Promise<number | null> {
    try {
      const { data, error, count } = await supabaseAdmin
        .from(tabela)
        .select('*', { count: 'exact' })
        .range(0, 4999);
      if (error) return null;
      return count ?? (data ?? []).length;
    } catch {
      return null;
    }
  }

  /**
   * Amostra das linhas mais recentes de uma tabela (cobertura automática da
   * IA: tabelas sem fonte dedicada entram no snapshot com poucas linhas).
   * Ordem por `created_at` quando existe; se a coluna não existir, cai para
   * sem ordem (evita erro de coluna em tabela sem o campo).
   */
  async getLinhasRecentes(tabela: string, limite: number): Promise<Record<string, unknown>[] | null> {
    try {
      const comOrdem = await supabaseAdmin
        .from(tabela)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limite);
      if (!comOrdem.error) return (comOrdem.data ?? []) as Record<string, unknown>[];
      const simples = await supabaseAdmin.from(tabela).select('*').limit(limite);
      if (simples.error) return null;
      return (simples.data ?? []) as Record<string, unknown>[];
    } catch {
      return null;
    }
  }
}
