import { z } from 'zod';

const data = z.string().date().nullable().optional();
const texto = z.string().trim().max(300).nullable().optional();

export const MotoristaSchema = z.object({
  id: z.string().uuid(),
  nome_completo: z.string().min(3).max(200),
  cpf: z.string().min(11).max(14).nullable().optional(),
  rg: texto,
  data_nascimento: data,
  /** Filiação (se constar no documento). */
  nome_mae: texto,
  nome_pai: texto,
  cnh: z.string().nullable().optional(),
  cnh_categoria: z.string().nullable().optional(),
  cnh_validade: data,
  cnh_primeira_habilitacao: data,
  telefone: z.string().nullable().optional(),
  codigo_externo: texto,
  apelido: texto,
  vinculo: texto,
  nacionalidade: texto,
  placa_habitual: z.string().max(8).nullable().optional(),
  observacao: z.string().max(2000).nullable().optional(),
  frota_propria: z.boolean().default(true),
  ativo: z.boolean().default(true),
  dados_extras: z.record(z.unknown()).nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Motorista = z.infer<typeof MotoristaSchema>;

export const CreateMotoristaSchema = MotoristaSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});
export type CreateMotoristaInput = z.infer<typeof CreateMotoristaSchema>;

export const UpdateMotoristaSchema = CreateMotoristaSchema.partial();
export type UpdateMotoristaInput = z.infer<typeof UpdateMotoristaSchema>;

// ---------------------------------------------------------------------------
// Documentos do motorista (CNH) e dos veículos que ele conduz (CRLV)
// ---------------------------------------------------------------------------

export const TipoDocumentoMotoristaSchema = z.enum([
  'CNH',
  'CRLV_CAVALO',
  'CRLV_CARRETA',
  'CRLV_CARRETA_2',
  'OUTRO',
]);
export type TipoDocumentoMotorista = z.infer<typeof TipoDocumentoMotoristaSchema>;

export const TIPO_DOCUMENTO_MOTORISTA_LABEL: Record<TipoDocumentoMotorista, string> = {
  CNH: 'CNH',
  CRLV_CAVALO: 'CRLV do cavalo',
  CRLV_CARRETA: 'CRLV da carreta',
  CRLV_CARRETA_2: 'CRLV da 2ª carreta',
  OUTRO: 'Outro documento',
};

/** Arquivo enviado em base64 (fotos; PDFs são convertidos em imagem no navegador para o OCR). */
export const ArquivoBase64Schema = z.object({
  nome: z.string().min(1).max(200),
  mime: z.string().regex(/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/, 'Envie foto (JPG/PNG/WEBP) ou PDF'),
  base64: z.string().min(10).max(14_000_000),
});
export type ArquivoBase64 = z.infer<typeof ArquivoBase64Schema>;

export const OcrDocumentoInputSchema = z.object({
  tipo: z.enum(['CNH', 'CRLV']),
  /** Até 3 imagens (frente, verso, página do PDF...). Só imagens: o navegador converte PDF. */
  imagens: z.array(ArquivoBase64Schema).min(1).max(3),
});
export type OcrDocumentoInput = z.infer<typeof OcrDocumentoInputSchema>;

export const OcrCnhSchema = z.object({
  nome_completo: z.string().nullable().optional(),
  cpf: z.string().nullable().optional(),
  rg: z.string().nullable().optional(),
  data_nascimento: z.string().nullable().optional(),
  nome_mae: z.string().nullable().optional(),
  nome_pai: z.string().nullable().optional(),
  cnh: z.string().nullable().optional(),
  cnh_categoria: z.string().nullable().optional(),
  cnh_validade: z.string().nullable().optional(),
  cnh_primeira_habilitacao: z.string().nullable().optional(),
  nacionalidade: z.string().nullable().optional(),
});
export type OcrCnh = z.infer<typeof OcrCnhSchema>;

export const OcrCrlvSchema = z.object({
  placa: z.string().nullable().optional(),
  renavam: z.string().nullable().optional(),
  chassi: z.string().nullable().optional(),
  marca: z.string().nullable().optional(),
  modelo: z.string().nullable().optional(),
  ano_fabricacao: z.number().int().nullable().optional(),
  ano_modelo: z.number().int().nullable().optional(),
  especie_tipo: z.string().nullable().optional(),
  proprietario: z.string().nullable().optional(),
  exercicio: z.string().nullable().optional(),
});
export type OcrCrlv = z.infer<typeof OcrCrlvSchema>;

export interface OcrDocumentoResultado {
  tipo: 'CNH' | 'CRLV';
  dados: OcrCnh | OcrCrlv;
  /** Campos que a IA não conseguiu ler com segurança. */
  ilegiveis: string[];
  observacao?: string;
}

export const EnviarDocumentosMotoristaSchema = z.object({
  tipo: TipoDocumentoMotoristaSchema,
  placa: z
    .string()
    .trim()
    .max(8)
    .transform((p) => p.toUpperCase().replace(/[\s-]/g, ''))
    .nullable()
    .optional(),
  arquivos: z.array(ArquivoBase64Schema).min(1).max(3),
  /** Dados lidos pelo OCR (guardados junto do documento; para CRLV atualizam o veículo). */
  ocr_dados: z.record(z.unknown()).nullable().optional(),
});
export type EnviarDocumentosMotoristaInput = z.infer<typeof EnviarDocumentosMotoristaSchema>;

export interface MotoristaDocumento {
  id: string;
  motorista_id: string;
  tipo: TipoDocumentoMotorista;
  placa: string | null;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number | null;
  storage_path: string;
  ocr_dados: Record<string, unknown> | null;
  created_at: string;
  /** URL temporária para abrir o arquivo (gerada na leitura). */
  url?: string | null;
}
