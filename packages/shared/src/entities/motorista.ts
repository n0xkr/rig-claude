import { z } from 'zod';
import { base64Valido } from '../validacaoDocumentos.js';

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

/**
 * Arquivo enviado em base64 (fotos; PDFs são convertidos em imagem no navegador para o OCR).
 * O MIME declarado é só uma dica: a API confere a assinatura binária (magic bytes)
 * e usa o tipo real (ver `inspecionarArquivoBase64`). 14M caracteres ≈ 10 MB decodificados.
 */
export const ArquivoBase64Schema = z.object({
  nome: z.string().min(1).max(200),
  mime: z.string().regex(/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/, 'Envie foto (JPG/PNG/WEBP) ou PDF'),
  base64: z
    .string()
    .min(10)
    .max(14_000_000)
    .refine(base64Valido, 'Conteúdo em base64 inválido (envie o arquivo sem o prefixo data: e sem quebras de linha)'),
});
export type ArquivoBase64 = z.infer<typeof ArquivoBase64Schema>;

/** Slot do CRLV no cadastro do motorista (o OCR confere a espécie do veículo com ele). */
export const SlotCrlvSchema = z.enum(['CRLV_CAVALO', 'CRLV_CARRETA', 'CRLV_CARRETA_2']);
export type SlotCrlv = z.infer<typeof SlotCrlvSchema>;

/**
 * Para que a leitura serve: `PORTARIA` pede ao modelo só o necessário para a
 * entrada (nome, CPF, validade/categoria da CNH; placa e proprietário do CRLV),
 * em vez de filiação, RG e nascimento (minimização — LGPD).
 */
export const FinalidadeOcrSchema = z.enum(['CADASTRO', 'PORTARIA']);
export type FinalidadeOcr = z.infer<typeof FinalidadeOcrSchema>;

export const OcrDocumentoInputSchema = z.object({
  tipo: z.enum(['CNH', 'CRLV']),
  /** Até 3 imagens (frente, verso, página do PDF...). Só imagens: o navegador converte PDF. */
  imagens: z.array(ArquivoBase64Schema).min(1).max(3),
  /**
   * Camada de texto do PDF digital (CNH digital, CRLV-e), extraída no navegador.
   * Não vai ao modelo: serve de evidência determinística (CPF/RENAVAM/placa
   * conferidos no texto) e permite a leitura por regras quando a IA está fora.
   */
  texto: z.string().max(30_000).optional(),
  /** Cadastro em edição: a resposta traz as divergências documento × cadastro. */
  motorista_id: z.string().uuid().optional(),
  slot: SlotCrlvSchema.optional(),
  finalidade: FinalidadeOcrSchema.optional(),
});
export type OcrDocumentoInput = z.infer<typeof OcrDocumentoInputSchema>;

/** Confiança por campo: ALTA = conferida (dígito verificador, MRZ, texto do PDF); MEDIA = formato ok; BAIXA = confira. */
export const NivelConfiancaOcrSchema = z.enum(['ALTA', 'MEDIA', 'BAIXA']);
export type NivelConfiancaOcr = z.infer<typeof NivelConfiancaOcrSchema>;

export const NivelAlertaOcrSchema = z.enum(['INFO', 'AVISO', 'BLOQUEANTE']);
export type NivelAlertaOcr = z.infer<typeof NivelAlertaOcrSchema>;

/** Alerta estruturado da leitura (ex.: CNH vencida, categoria sem E, CPF inválido). */
export interface AlertaOcr {
  nivel: NivelAlertaOcr;
  /** Identificador estável (ex.: "CNH_VENCIDA", "CATEGORIA_SEM_E", "NOME_DIVERGENTE"). */
  codigo: string;
  campo?: string;
  mensagem: string;
}

/** Campo em que o documento difere do cadastro (motorista em edição ou veículo existente). */
export interface DivergenciaCadastroOcr {
  campo: string;
  cadastro: string | null;
  documento: string | null;
}

export interface CruzamentoOcr {
  /** Outro motorista já cadastrado com o CPF lido (evita cadastro duplicado). */
  motoristaExistente?: { id: string; nome_completo: string } | null;
  /** Documento × cadastro (só quando `motorista_id` é informado, para OPERADOR+). */
  divergencias?: DivergenciaCadastroOcr[];
  /** Veículo da frota com a placa lida (inclusive na grafia antiga/Mercosul). */
  veiculoExistente?: { id: string; placa: string; tipo: string; excluido: boolean } | null;
}

/** Proveniência da leitura (sem conteúdo): para o selo "IA + regras" e auditoria. */
export interface MetaLeituraOcr {
  origem: 'IA' | 'REGRAS' | 'IA+REGRAS';
  modelo: string | null;
  versao_prompt: string;
  /** Chamadas ao modelo (1 + releitura dirigida, se houve). */
  leituras: number;
  latencia_ms: number;
  /** Campos relidos porque falharam na validação determinística. */
  releitura?: string[];
}

/** GET /motoristas/ocr/status — para a tela mostrar ou esconder a leitura automática. */
export interface StatusOcr {
  disponivel: boolean;
  motivo: string | null;
  rotulo: 'IA + regras' | 'Regras';
  /** Aviso de transparência (as imagens vão a um provedor externo de IA). */
  aviso_privacidade: string;
  /** PDFs digitais com camada de texto são lidos por regras mesmo sem IA. */
  leitura_pdf_sem_ia: boolean;
  max_imagens: number;
}

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
  /** Só valores que passaram na validação (CPF com DV, data que existe, placa no formato...). */
  dados: OcrCnh | OcrCrlv;
  /** Campos que a IA não conseguiu ler com segurança (chaves de `dados`). */
  ilegiveis: string[];
  observacao?: string;
  /** Confiança por campo de `dados`. */
  confianca?: Partial<Record<string, NivelConfiancaOcr>>;
  alertas?: AlertaOcr[];
  /** Valores lidos que NÃO passaram na validação (ex.: CPF com DV errado): nunca aplicados sozinhos. */
  sugestoes?: Record<string, string>;
  cruzamento?: CruzamentoOcr;
  meta?: MetaLeituraOcr;
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
  /**
   * Dados lidos pelo OCR. A API revalida por tipo: do CRLV guarda os dados do
   * veículo (e completa o cadastro dele); da CNH guarda só metadados (campos
   * lidos, confiança) — CPF, RG e filiação já estão no cadastro do motorista.
   */
  ocr_dados: z.record(z.unknown()).nullable().optional(),
});
export type EnviarDocumentosMotoristaInput = z.infer<typeof EnviarDocumentosMotoristaSchema>;

/** O que aconteceu com o veículo ao guardar um CRLV (devolvido no POST de documentos). */
export interface ResultadoSincronizacaoVeiculo {
  acao: 'CRIADO' | 'ATUALIZADO' | 'REATIVADO' | 'SEM_ALTERACAO' | 'NAO_APLICADO' | 'FALHOU';
  placa: string;
  veiculo_id: string | null;
  /** Campos em que o CRLV difere do cadastro (o cadastro NÃO é sobrescrito). */
  divergencias: DivergenciaCadastroOcr[];
  alertas: AlertaOcr[];
  mensagem?: string;
}

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
  /** Só na resposta do envio de CRLV: resultado da atualização do veículo. */
  veiculo_sincronizado?: ResultadoSincronizacaoVeiculo;
}
