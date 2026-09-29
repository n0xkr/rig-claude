import type { AcompanhamentoVeiculo, Veiculo, ViagemAtivaResumo } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { fetchAllPages } from '../../lib/fetchAllPages.js';

interface ViagemLinha extends ViagemAtivaResumo {
  placa_cavalo: string;
  veiculo_id: string | null;
}

export class AcompanhamentoRepository {
  /** Todos os veículos ativos no cadastro (paginado — nunca trunca em 1000). */
  async listVeiculos(): Promise<Veiculo[]> {
    return fetchAllPages<Veiculo>((from, to) =>
      supabaseAdmin
        .from('veiculos')
        .select('*')
        .is('deleted_at', null)
        .order('placa', { ascending: true })
        .range(from, to),
    );
  }

  /** Viagens ainda em andamento, para mostrar "onde cada veículo está indo". */
  private async listViagensAtivas(): Promise<ViagemLinha[]> {
    return fetchAllPages<ViagemLinha>((from, to) =>
      supabaseAdmin
        .from('viagens')
        .select('id, origem, destino, status, placa_cavalo, veiculo_id')
        .is('deleted_at', null)
        .not('status', 'in', '(ENCERRADA,CANCELADA,ENTREGUE)')
        .order('id', { ascending: false })
        .range(from, to),
    );
  }

  async listComViagemAtiva(): Promise<AcompanhamentoVeiculo[]> {
    const [veiculos, viagens] = await Promise.all([this.listVeiculos(), this.listViagensAtivas()]);
    const porPlaca = new Map<string, ViagemLinha>();
    // Ordenadas da mais recente para a mais antiga: a primeira de cada placa é a atual.
    for (const v of viagens) if (!porPlaca.has(v.placa_cavalo)) porPlaca.set(v.placa_cavalo, v);
    return veiculos.map((veiculo) => {
      const v = porPlaca.get(veiculo.placa);
      return {
        ...veiculo,
        viagem_ativa: v
          ? { id: v.id, origem: v.origem, destino: v.destino, status: v.status }
          : null,
      } as AcompanhamentoVeiculo;
    });
  }
}
