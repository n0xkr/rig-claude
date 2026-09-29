import { z } from 'zod';

/**
 * Módulo de Importação (Excel/CSV -> banco -> chatbot). Ponte temporária
 * até a integração com Google Sheets existir (ver documento de evolução,
 * seções 15-18): o usuário faz upload manual de uma planilha, mapeia as
 * colunas para os campos do sistema e os dados entram pelo MESMO caminho de
 * validação (`Create*Schema` do Zod) usado pelos formulários normais — nunca
 * um atalho que ignore regras de negócio.
 *
 * Alvo de importação deliberadamente restrito a tabelas SEM chave
 * estrangeira obrigatória além de `placa` (resolvida por lookup) — isso
 * evita que uma planilha precise conter UUIDs internos, que o usuário de
 * negócio nunca teria em mãos.
 */
export const ImportTargetSchema = z.enum(['viagens', 'manutencoes_veiculo', 'veiculos']);
export type ImportTarget = z.infer<typeof ImportTargetSchema>;

export const OrigemImportacaoSchema = z.enum(['EXCEL', 'CSV', 'MANUAL']);
export type OrigemImportacao = z.infer<typeof OrigemImportacaoSchema>;

export const StatusImportDatasetSchema = z.enum(['VALIDADO', 'IMPORTADO', 'ERRO']);
export type StatusImportDataset = z.infer<typeof StatusImportDatasetSchema>;

export type ImportFieldType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum';

export interface ImportFieldSpec {
  key: string;
  label: string;
  required: boolean;
  type: ImportFieldType;
  /** Para type='enum': valores aceitos (ex: país destino, tipo de manutenção). */
  options?: string[];
  /** Descrição curta para ajudar o usuário a mapear a coluna certa. */
  hint?: string;
}

/**
 * Especificação de campos por alvo de importação — usada tanto pela UI
 * (montar o mapeamento coluna -> campo, com sugestão automática por nome)
 * quanto pelo backend (coerção de tipos antes da validação Zod real).
 */
export const IMPORT_TARGET_FIELDS: Record<ImportTarget, ImportFieldSpec[]> = {
  veiculos: [
    {
      key: 'placa',
      label: 'Placa',
      required: true,
      type: 'text',
      hint: 'Se já existir, o veículo é ATUALIZADO (acompanhamento)',
    },
    {
      key: 'tipo',
      label: 'Tipo do veículo',
      required: false,
      type: 'enum',
      options: ['CAVALO', 'CARRETA_ABERTA', 'CARRETA_SIDER', 'CARRETA_OUTRO'],
      hint: 'Padrão: CAVALO quando ausente',
    },
    { key: 'marca', label: 'Marca', required: false, type: 'text' },
    { key: 'modelo', label: 'Modelo', required: false, type: 'text' },
    { key: 'ano_fabricacao', label: 'Ano de fabricação', required: false, type: 'number' },
    { key: 'capacidade_kg', label: 'Capacidade (kg)', required: false, type: 'number' },
    { key: 'frota_propria', label: 'Frota própria', required: false, type: 'boolean' },
    {
      key: 'status_operacional',
      label: 'Status operacional',
      required: false,
      type: 'enum',
      options: ['DISPONIVEL', 'EM_TRANSITO', 'MANUTENCAO', 'GARAGEM'],
    },
    { key: 'motorista_atual', label: 'Motorista atual', required: false, type: 'text' },
    { key: 'km_atual', label: 'Quilometragem atual', required: false, type: 'number' },
    {
      key: 'nivel_combustivel',
      label: 'Nível de combustível (%)',
      required: false,
      type: 'number',
    },
    { key: 'localizacao_atual', label: 'Localização atual', required: false, type: 'text' },
    { key: 'ultima_manutencao_data', label: 'Última manutenção', required: false, type: 'date' },
    { key: 'proxima_manutencao_data', label: 'Próxima manutenção', required: false, type: 'date' },
    { key: 'observacoes_acompanhamento', label: 'Observações', required: false, type: 'text' },
  ],
  viagens: [
    { key: 'placa_cavalo', label: 'Placa do cavalo', required: true, type: 'text' },
    { key: 'numero_crt', label: 'Número do CRT', required: false, type: 'text' },
    { key: 'numero_mic_dta', label: 'Número MIC/DTA', required: false, type: 'text' },
    { key: 'origem', label: 'Origem', required: true, type: 'text' },
    { key: 'destino', label: 'Destino', required: true, type: 'text' },
    {
      key: 'pais_destino',
      label: 'País destino',
      required: false,
      type: 'enum',
      options: ['AR', 'BO', 'CL', 'PY', 'UY', 'PE'],
    },
    { key: 'peso_kg', label: 'Peso (kg)', required: false, type: 'number' },
    { key: 'valor_frete', label: 'Valor do frete', required: false, type: 'number' },
    { key: 'observacoes', label: 'Observações', required: false, type: 'text' },
  ],
  manutencoes_veiculo: [
    {
      key: 'placa',
      label: 'Placa do veículo',
      required: true,
      type: 'text',
      hint: 'Resolvida para o veículo já cadastrado com esta placa',
    },
    {
      key: 'tipo',
      label: 'Tipo de manutenção',
      required: true,
      type: 'enum',
      options: ['PREVENTIVA', 'CORRETIVA', 'REVISAO', 'TROCA_PNEUS', 'OUTRO'],
    },
    { key: 'data_manutencao', label: 'Data da manutenção', required: true, type: 'date' },
    { key: 'km_veiculo', label: 'KM do veículo', required: false, type: 'number' },
    { key: 'custo', label: 'Custo', required: true, type: 'number' },
    { key: 'descricao', label: 'Descrição', required: false, type: 'text' },
    {
      key: 'proxima_manutencao_data',
      label: 'Próxima manutenção (data)',
      required: false,
      type: 'date',
    },
    {
      key: 'proxima_manutencao_km',
      label: 'Próxima manutenção (km)',
      required: false,
      type: 'number',
    },
    { key: 'observacoes', label: 'Observações', required: false, type: 'text' },
  ],
};

export const ImportLinhaErroSchema = z.object({
  linha: z.number().int().nonnegative(),
  campo: z.string().nullable().optional(),
  mensagem: z.string(),
});
export type ImportLinhaErro = z.infer<typeof ImportLinhaErroSchema>;

export const ValidarImportacaoInputSchema = z.object({
  target: ImportTargetSchema,
  criarVeiculosAusentes: z.boolean().optional(),
  linhas: z.array(z.record(z.unknown())).min(1).max(5000),
});
export type ValidarImportacaoInput = z.infer<typeof ValidarImportacaoInputSchema>;

export const ValidarImportacaoResultSchema = z.object({
  totalLinhas: z.number().int().nonnegative(),
  linhasValidas: z.number().int().nonnegative(),
  linhasComErro: z.number().int().nonnegative(),
  erros: z.array(ImportLinhaErroSchema),
});
export type ValidarImportacaoResult = z.infer<typeof ValidarImportacaoResultSchema>;

export const CommitImportacaoInputSchema = z.object({
  target: ImportTargetSchema,
  criarVeiculosAusentes: z.boolean().optional(),
  nome: z.string().min(1),
  origem: OrigemImportacaoSchema.default('EXCEL'),
  linhas: z.array(z.record(z.unknown())).min(1).max(5000),
});
export type CommitImportacaoInput = z.infer<typeof CommitImportacaoInputSchema>;

export const ImportDatasetSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  target: ImportTargetSchema,
  origem: OrigemImportacaoSchema,
  total_linhas: z.number().int().nonnegative(),
  linhas_importadas: z.number().int().nonnegative(),
  linhas_com_erro: z.number().int().nonnegative(),
  status: StatusImportDatasetSchema,
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
});
export type ImportDataset = z.infer<typeof ImportDatasetSchema>;

export const CommitImportacaoResultSchema = z.object({
  dataset: ImportDatasetSchema,
  erros: z.array(ImportLinhaErroSchema),
});
export type CommitImportacaoResult = z.infer<typeof CommitImportacaoResultSchema>;
