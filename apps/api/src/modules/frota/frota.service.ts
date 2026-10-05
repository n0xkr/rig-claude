import type {
  AtualizarQuilometragemViagemInput,
  CreateManutencaoVeiculoInput,
  FrotaKpiResponse,
  FrotaKpiVeiculo,
  ManutencaoVeiculo,
  UpdateManutencaoVeiculoInput,
} from '@rigabras/shared';
import {
  FrotaRepository,
  type FrotaKpiFilter,
  type ListManutencoesFilter,
  type ViagemFrotaRow,
} from './frota.repository.js';
import { ViagensRepository } from '../viagens/viagens.repository.js';
import { VeiculosRepository } from '../veiculos/veiculos.repository.js';
import { DomainError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/auditLog.js';

/**
 * Serviço de Controle de Frota (Módulo 4, parte A): CRUD de manutenções,
 * registro de quilometragem/consumo por viagem e agregação dos indicadores
 * prioritários de frota (km rodado/vazio, custo/km, consumo, ocupação,
 * disponíveis x em viagem). Regras de negócio isoladas do HTTP (critério #1).
 */
export class FrotaService {
  constructor(
    private readonly repo: FrotaRepository = new FrotaRepository(),
    private readonly viagensRepo: ViagensRepository = new ViagensRepository(),
    private readonly veiculosRepo: VeiculosRepository = new VeiculosRepository(),
  ) {}

  // ------------------------------------------------------------------
  // Manutenções
  // ------------------------------------------------------------------
  listManutencoes(filter: ListManutencoesFilter) {
    return this.repo.listManutencoes(filter);
  }

  async getManutencaoById(id: string): Promise<ManutencaoVeiculo> {
    const manutencao = await this.repo.findManutencaoById(id);
    if (!manutencao) throw new NotFoundError('manutencao_veiculo', id);
    return manutencao;
  }

  async createManutencao(
    input: CreateManutencaoVeiculoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<ManutencaoVeiculo> {
    const veiculo = await this.veiculosRepo.findById(input.veiculo_id);
    if (!veiculo) throw new NotFoundError('veiculo', input.veiculo_id);

    const solicitante = userId ? await this.repo.findNomeSolicitante(userId) : null;
    const created = await this.repo.createManutencao(
      { ...input, solicitante_id: userId, solicitante },
      userId,
    );
    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'manutencoes_veiculo',
      entityId: created.id,
      changes: { after: created },
      ip,
    });
    return created;
  }

  async updateManutencao(
    id: string,
    input: UpdateManutencaoVeiculoInput,
    userId: string | null,
    ip: string | null,
  ): Promise<ManutencaoVeiculo> {
    const before = await this.getManutencaoById(id);
    if (Object.keys(input).length === 0) return before; // PATCH vazio: nada a atualizar (o PostgREST rejeita UPDATE sem colunas)
    const updated = await this.repo.updateManutencao(id, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'manutencoes_veiculo',
      entityId: id,
      changes: { before, after: updated },
      ip,
    });
    return updated;
  }

  async softDeleteManutencao(id: string, userId: string | null, ip: string | null): Promise<void> {
    await this.getManutencaoById(id);
    await this.repo.softDeleteManutencao(id);
    await writeAuditLog({
      userId,
      action: 'DELETE',
      entity: 'manutencoes_veiculo',
      entityId: id,
      changes: null,
      ip,
    });
  }

  // ------------------------------------------------------------------
  // Quilometragem/consumo por viagem (colunas próprias do Módulo 4 em
  // `viagens` — ver nota de modelagem na migration 0005). Nunca chama
  // `ViagensService`/`ViagensRepository.update` (que tocaria colunas do
  // Módulo 2); usa um método de update dedicado, restrito às 3 colunas.
  // ------------------------------------------------------------------
  async atualizarQuilometragem(
    viagemId: string,
    input: AtualizarQuilometragemViagemInput,
    userId: string | null,
    ip: string | null,
  ) {
    const viagem = await this.viagensRepo.findById(viagemId);
    if (!viagem) throw new NotFoundError('viagem', viagemId);
    // Um PATCH sem nenhuma coluna não tem o que atualizar (e o PostgREST rejeitaria o UPDATE vazio).
    if (Object.values(input).every((valor) => valor === undefined)) {
      throw new DomainError(
        'Nenhum dado de quilometragem informado',
        422,
        'Informe ao menos km_rodado, km_vazio ou consumo_combustivel_litros',
      );
    }

    const updated = await this.repo.updateQuilometragem(viagemId, input);
    await writeAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'viagens_quilometragem',
      entityId: viagemId,
      changes: { after: updated },
      ip,
    });
    return updated;
  }

  // ------------------------------------------------------------------
  // KPIs de frota
  // ------------------------------------------------------------------
  async getKpis(filter: FrotaKpiFilter): Promise<FrotaKpiResponse> {
    const [veiculosTodos, emViagem, viagens, manutencoes] = await Promise.all([
      this.repo.listVeiculos(),
      this.repo.listVeiculosEmViagem(),
      this.repo.listViagensParaKpis(filter),
      this.repo.listManutencoesParaKpis(filter),
    ]);

    const viagemIds = viagens.map((v) => v.id);
    const retornoVazioRows = await this.repo.listRetornoVazioByViagemIds(viagemIds);
    const retornoVazioPorViagem = new Map(
      retornoVazioRows.map((r) => [r.viagem_id, r.retorno_vazio]),
    );

    const veiculos = filter.veiculoId
      ? veiculosTodos.filter((v) => v.id === filter.veiculoId)
      : veiculosTodos;

    // `viagens.veiculo_id` é opcional (só `placa_cavalo` é NOT NULL): atribui a viagem ao veículo pelo id ou, na falta dele, pela placa.
    const veiculoIdPorPlaca = new Map(veiculosTodos.map((v) => [v.placa, v.id]));
    const viagensPorVeiculo = new Map<string, ViagemFrotaRow[]>();
    for (const viagem of viagens) {
      const veiculoId = viagem.veiculo_id ?? veiculoIdPorPlaca.get(viagem.placa_cavalo);
      if (!veiculoId) continue;
      const lista = viagensPorVeiculo.get(veiculoId) ?? [];
      lista.push(viagem);
      viagensPorVeiculo.set(veiculoId, lista);
    }
    const veiculoEmViagem = (v: { id: string; placa: string }) =>
      emViagem.ids.has(v.id) || emViagem.placas.has(v.placa);

    const porVeiculo: FrotaKpiVeiculo[] = veiculos.map((veiculo) => {
      const viagensVeiculo = viagensPorVeiculo.get(veiculo.id) ?? [];
      const manutencoesVeiculo = manutencoes.filter((m) => m.veiculo_id === veiculo.id);

      const kmRodado = round2(sum(viagensVeiculo.map((v) => v.km_rodado ?? 0)));
      const kmVazio = round2(sum(viagensVeiculo.map((v) => v.km_vazio ?? 0)));
      const consumo = round2(sum(viagensVeiculo.map((v) => v.consumo_combustivel_litros ?? 0)));
      const custoManutencao = round2(sum(manutencoesVeiculo.map((m) => m.custo)));
      const qtdViagensRetornoVazio = viagensVeiculo.filter(
        (v) => retornoVazioPorViagem.get(v.id) === true,
      ).length;

      return {
        veiculo_id: veiculo.id,
        placa: veiculo.placa,
        tipo: veiculo.tipo,
        frota_propria: veiculo.frota_propria,
        ativo: veiculo.ativo,
        status: veiculoEmViagem(veiculo) ? 'EM_VIAGEM' : 'DISPONIVEL',
        qtd_viagens: viagensVeiculo.length,
        km_rodado_total: kmRodado,
        km_vazio_total: kmVazio,
        consumo_combustivel_total_litros: consumo,
        consumo_medio_km_litro: consumo > 0 ? round2(kmRodado / consumo) : null,
        custo_manutencao_total: custoManutencao,
        custo_km: kmRodado > 0 ? round2(custoManutencao / kmRodado) : null,
        qtd_viagens_retorno_vazio: qtdViagensRetornoVazio,
      };
    });

    const veiculosAtivos = veiculos.filter((v) => v.ativo);
    const frotaTotal = veiculosAtivos.length;
    const emViagemCount = veiculosAtivos.filter(veiculoEmViagem).length;
    const disponiveisCount = frotaTotal - emViagemCount;

    const kmRodadoTotal = round2(sum(porVeiculo.map((v) => v.km_rodado_total)));
    const kmVazioTotal = round2(sum(porVeiculo.map((v) => v.km_vazio_total)));
    const consumoTotal = round2(sum(porVeiculo.map((v) => v.consumo_combustivel_total_litros)));
    const custoManutencaoTotal = round2(sum(porVeiculo.map((v) => v.custo_manutencao_total)));
    const totalViagensNoPeriodo = veiculos.reduce(
      (acc, v) => acc + (viagensPorVeiculo.get(v.id)?.length ?? 0),
      0,
    );
    const qtdViagensRetornoVazioTotal = sum(porVeiculo.map((v) => v.qtd_viagens_retorno_vazio));

    return {
      periodo: { inicio: filter.periodStart ?? null, fim: filter.periodEnd ?? null },
      frota_total: frotaTotal,
      veiculos_disponiveis: disponiveisCount,
      veiculos_em_viagem: emViagemCount,
      percentual_ocupacao: frotaTotal > 0 ? round2((emViagemCount / frotaTotal) * 100) : 0,
      km_rodado_total: kmRodadoTotal,
      km_vazio_total: kmVazioTotal,
      // "km vazio": derivado numericamente de viagens.km_vazio (hodômetro),
      // cruzado (nunca duplicado) com o sinal booleano fretes.retorno_vazio
      // do Módulo 3 via qtd_viagens_retorno_vazio/percentual_viagens_retorno_vazio.
      percentual_km_vazio: kmRodadoTotal > 0 ? round2((kmVazioTotal / kmRodadoTotal) * 100) : 0,
      percentual_viagens_retorno_vazio:
        totalViagensNoPeriodo > 0
          ? round2((qtdViagensRetornoVazioTotal / totalViagensNoPeriodo) * 100)
          : 0,
      consumo_combustivel_total_litros: consumoTotal,
      consumo_medio_km_litro: consumoTotal > 0 ? round2(kmRodadoTotal / consumoTotal) : null,
      custo_manutencao_total: custoManutencaoTotal,
      // custo/km considera, nesta fase, apenas custos de manutenção
      // registrados no período (não há integração de preço de combustível
      // ainda — ver docs/NOTES.md).
      custo_km_frota: kmRodadoTotal > 0 ? round2(custoManutencaoTotal / kmRodadoTotal) : null,
      por_veiculo: porVeiculo,
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
