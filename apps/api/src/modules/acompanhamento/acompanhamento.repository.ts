import {
  STATUS_VIAGEM_EM_ANDAMENTO,
  STATUS_VIAGEM_LABEL,
  type AcompanhamentoVeiculo,
  type StatusViagem,
  type Veiculo,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { fetchAllPages } from '../../lib/fetchAllPages.js';

interface ViagemLinha {
  id: string;
  origem: string;
  destino: string;
  status: string;
  placa_cavalo: string;
  placa_carreta?: string | null;
  placa_carreta_2?: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
  cliente?: string | null;
  dados_extras?: Record<string, unknown> | null;
}

/** "IIK-3294", "iik 3294" e "IIK3294" são a mesma placa (cadastros antigos têm hífen). */
export const chavePlaca = (p: unknown) => String(p ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** Viagem rodando de fato (programada/agendada ainda não tirou o veículo do pátio). */
const emOperacao = (v: ViagemLinha) => STATUS_VIAGEM_EM_ANDAMENTO.includes(v.status as StatusViagem);

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
    // `*`: as colunas de carreta/cliente/extras só existem após a migration 0014.
    return fetchAllPages<ViagemLinha>((from, to) =>
      supabaseAdmin
        .from('viagens')
        .select('*')
        .is('deleted_at', null)
        .not('status', 'in', '(ENCERRADA,CANCELADA,ENTREGUE)')
        .order('created_at', { ascending: false })
        .range(from, to),
    );
  }

  private async nomesMotoristas(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabaseAdmin
        .from('motoristas')
        .select('id, nome_completo')
        .in('id', ids.slice(i, i + 200));
      for (const m of (data ?? []) as Array<{ id: string; nome_completo: string }>) out.set(m.id, m.nome_completo);
    }
    return out;
  }

  /**
   * Cada veículo com a viagem em que está agora. O cadastro do veículo quase
   * nunca é atualizado à mão, então status, motorista e localização vêm da
   * viagem ativa quando o veículo não tem esses dados próprios.
   */
  async listComViagemAtiva(): Promise<AcompanhamentoVeiculo[]> {
    const [veiculos, viagens] = await Promise.all([this.listVeiculos(), this.listViagensAtivas()]);
    const motoristas = await this.nomesMotoristas([
      ...new Set(viagens.map((v) => v.motorista_id).filter((x): x is string => !!x)),
    ]);

    // Da mais recente para a mais antiga: a primeira em operação de cada placa é a atual
    // (uma viagem só programada não "rouba" o lugar da que está rodando).
    const ordenadas = [...viagens.filter(emOperacao), ...viagens.filter((v) => !emOperacao(v))];
    const porId = new Map<string, ViagemLinha>();
    const porPlaca = new Map<string, { v: ViagemLinha; carreta: boolean }>();
    for (const v of ordenadas) {
      if (v.veiculo_id && !porId.has(v.veiculo_id)) porId.set(v.veiculo_id, v);
      const cavalo = chavePlaca(v.placa_cavalo);
      if (cavalo && !porPlaca.has(cavalo)) porPlaca.set(cavalo, { v, carreta: false });
      for (const c of [v.placa_carreta, v.placa_carreta_2]) {
        const k = chavePlaca(c);
        if (k && !porPlaca.has(k)) porPlaca.set(k, { v, carreta: true });
      }
    }

    return veiculos.map((veiculo) => {
      const achado = porPlaca.get(chavePlaca(veiculo.placa));
      const v = porId.get(veiculo.id) ?? achado?.v;
      const carreta = !porId.has(veiculo.id) && !!achado?.carreta;
      if (!v) return { ...veiculo, viagem_ativa: null } as AcompanhamentoVeiculo;

      const extras = v.dados_extras ?? {};
      const localizacao =
        (typeof extras['Localização atual'] === 'string' ? (extras['Localização atual'] as string) : null) ??
        STATUS_VIAGEM_LABEL[v.status as StatusViagem] ??
        null;
      const motorista = v.motorista_id ? (motoristas.get(v.motorista_id) ?? null) : null;
      const rodando = emOperacao(v);
      return {
        ...veiculo,
        status_operacional:
          rodando && veiculo.status_operacional === 'DISPONIVEL' ? 'EM_TRANSITO' : veiculo.status_operacional,
        motorista_atual: veiculo.motorista_atual ?? motorista,
        localizacao_atual: veiculo.localizacao_atual ?? (rodando ? localizacao : null),
        viagem_ativa: {
          id: v.id,
          origem: v.origem,
          destino: v.destino,
          status: v.status,
          motorista,
          cliente: v.cliente ?? null,
          localizacao,
          cavalo: carreta ? v.placa_cavalo : null,
        },
      } as AcompanhamentoVeiculo;
    });
  }
}
