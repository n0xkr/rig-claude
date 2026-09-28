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
      .eq('status', 'EM_DOCUMENTACAO')
      .is('deleted_at', null);
    if (error) throw error;
    return (data ?? []).length;
  }
}
