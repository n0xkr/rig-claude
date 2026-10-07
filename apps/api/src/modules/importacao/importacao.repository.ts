import type { ImportDataset, ImportTarget, OrigemImportacao } from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';

const DATASETS = 'import_datasets';

const TARGET_TABLE: Record<ImportTarget, string> = {
  viagens: 'viagens',
  manutencoes_veiculo: 'manutencoes_veiculo',
  veiculos: 'veiculos',
};

export class ImportacaoRepository {
  async findVeiculoIdByPlaca(placa: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from('veiculos')
      .select('id')
      .eq('placa', placa)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  }

  /** Veículo mínimo (só a placa) para não travar a importação de viagens/manutenções de placas ainda não cadastradas. */
  async createVeiculoStub(placa: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('veiculos')
      .insert({ placa, tipo: 'CAVALO', frota_propria: true, ativo: true })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  /** Acompanhamento por planilha: placa existente é ATUALIZADA, nova é criada. */
  async upsertVeiculoPorPlaca(dados: Record<string, unknown>): Promise<'criado' | 'atualizado'> {
    const placa = String(dados.placa);
    const existenteId = await this.findVeiculoIdByPlaca(placa);
    if (existenteId) {
      const { placa: _placa, ...campos } = dados;
      const { error } = await supabaseAdmin.from('veiculos').update(campos).eq('id', existenteId);
      if (error) throw error;
      return 'atualizado';
    }
    const { error } = await supabaseAdmin.from('veiculos').insert(dados);
    if (error) throw error;
    return 'criado';
  }

  async createDataset(
    nome: string,
    target: ImportTarget,
    origem: OrigemImportacao,
    createdBy: string | null,
  ): Promise<ImportDataset> {
    const { data, error } = await supabaseAdmin
      .from(DATASETS)
      .insert({ nome, target, origem, created_by: createdBy })
      .select('*')
      .single();
    if (error) throw error;
    return data as ImportDataset;
  }

  async updateDatasetResultado(
    id: string,
    totalLinhas: number,
    linhasImportadas: number,
    linhasComErro: number,
  ): Promise<ImportDataset> {
    const status = linhasImportadas === 0 ? 'ERRO' : 'IMPORTADO';
    const { data, error } = await supabaseAdmin
      .from(DATASETS)
      .update({
        total_linhas: totalLinhas,
        linhas_importadas: linhasImportadas,
        linhas_com_erro: linhasComErro,
        status,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ImportDataset;
  }

  async listDatasets(): Promise<ImportDataset[]> {
    const { data, error } = await supabaseAdmin
      .from(DATASETS)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ImportDataset[];
  }

  async bulkInsert(target: ImportTarget, rows: Array<Record<string, unknown>>): Promise<number> {
    if (rows.length === 0) return 0;
    const { error } = await supabaseAdmin.from(TARGET_TABLE[target]).insert(rows);
    if (error) throw error;
    return rows.length;
  }
}
