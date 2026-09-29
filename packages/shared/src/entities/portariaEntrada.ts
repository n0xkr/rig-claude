import { z } from 'zod';
import {
  StatusPortariaEntradaSchema,
  TipoDocumentoPortariaSchema,
  TipoOperacaoPortariaSchema,
} from '../enums.js';

/** Registro de entrada de veículo na portaria (Módulo 8). */
export const PortariaEntradaSchema = z.object({
  id: z.string().uuid(),
  viagem_id: z.string().uuid().nullable().optional(),
  placa_cavalo: z.string().min(1),
  placa_carreta: z.string().nullable().optional(),
  motorista_id: z.string().uuid().nullable().optional(),
  motorista_nome: z.string().min(1),
  motorista_documento: z.string().nullable().optional(),
  empresa_proprietario: z.string().nullable().optional(),
  numero_viagem_avulso: z.string().nullable().optional(),
  numero_crt: z.string().nullable().optional(),
  cliente: z.string().nullable().optional(),
  origem: z.string().nullable().optional(),
  destino: z.string().nullable().optional(),
  tipo_operacao: TipoOperacaoPortariaSchema.optional(),
  status: StatusPortariaEntradaSchema.optional(),
  observacoes: z.string().nullable().optional(),
  data_entrada: z.string().datetime().optional(),
  registrado_por: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type PortariaEntrada = z.infer<typeof PortariaEntradaSchema>;

export const CreatePortariaEntradaSchema = z.object({
  viagem_id: z.string().uuid().nullable().optional(),
  placa_cavalo: z.string().min(1),
  placa_carreta: z.string().nullable().optional(),
  motorista_id: z.string().uuid().nullable().optional(),
  motorista_nome: z.string().min(1),
  motorista_documento: z.string().nullable().optional(),
  empresa_proprietario: z.string().nullable().optional(),
  numero_viagem_avulso: z.string().nullable().optional(),
  numero_crt: z.string().nullable().optional(),
  cliente: z.string().nullable().optional(),
  origem: z.string().nullable().optional(),
  destino: z.string().nullable().optional(),
  tipo_operacao: TipoOperacaoPortariaSchema.optional(),
  observacoes: z.string().nullable().optional(),
});
export type CreatePortariaEntradaInput = z.infer<typeof CreatePortariaEntradaSchema>;

export const AtualizarStatusPortariaEntradaSchema = z.object({
  status: StatusPortariaEntradaSchema,
  observacoes: z.string().nullable().optional(),
});
export type AtualizarStatusPortariaEntradaInput = z.infer<
  typeof AtualizarStatusPortariaEntradaSchema
>;

/** Metadados de um documento anexado (o binário vive no Supabase Storage). */
export const PortariaDocumentoSchema = z.object({
  id: z.string().uuid(),
  entrada_id: z.string().uuid(),
  tipo_documento: TipoDocumentoPortariaSchema,
  storage_path: z.string().min(1),
  nome_arquivo: z.string().nullable().optional(),
  ocr_extraido_json: z.record(z.unknown()).nullable().optional(),
  conferido_por: z.string().uuid().nullable().optional(),
  conferido_em: z.string().datetime().nullable().optional(),
  enviado_por: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type PortariaDocumento = z.infer<typeof PortariaDocumentoSchema>;

export const CreatePortariaDocumentoSchema = z.object({
  tipo_documento: TipoDocumentoPortariaSchema,
  storage_path: z.string().min(1),
  nome_arquivo: z.string().nullable().optional(),
});
export type CreatePortariaDocumentoInput = z.infer<typeof CreatePortariaDocumentoSchema>;

/**
 * Passo 1 do upload: o browser NÃO tem sessão do Supabase Auth (o login é feito
 * pela API), então as policies de `storage.objects` (baseadas em auth.uid())
 * rejeitariam um upload direto. A API gera, com a service role, um caminho +
 * token de upload assinado; o browser envia o binário com esse token.
 */
export const SolicitarUploadDocumentoPortariaSchema = z.object({
  nome_arquivo: z.string().min(1).max(255),
});
export type SolicitarUploadDocumentoPortariaInput = z.infer<
  typeof SolicitarUploadDocumentoPortariaSchema
>;

export interface PortariaDocumentoUploadUrl {
  /** Caminho do objeto no bucket (`<entrada_id>/<uuid>.<ext>`), enviar depois em `storage_path`. */
  path: string;
  /** Token de upload assinado (uso único, curta duração). */
  token: string;
}

/** URL temporária (signed URL) para visualizar/baixar um documento do bucket privado. */
export interface PortariaDocumentoDownloadUrl {
  url: string;
  expires_in: number;
}

/** Registro de saída da portaria — 1:1 com a entrada. */
export const PortariaSaidaSchema = z.object({
  id: z.string().uuid(),
  entrada_id: z.string().uuid(),
  data_saida: z.string().datetime().optional(),
  situacao_descarga: z.string().nullable().optional(),
  tempo_patio_minutos: z.number().int().nonnegative(),
  observacoes: z.string().nullable().optional(),
  registrado_por: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
});
export type PortariaSaida = z.infer<typeof PortariaSaidaSchema>;

export const CreatePortariaSaidaSchema = z.object({
  situacao_descarga: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});
export type CreatePortariaSaidaInput = z.infer<typeof CreatePortariaSaidaSchema>;

export const PortariaEntradaDetalheSchema = PortariaEntradaSchema.extend({
  documentos: z.array(PortariaDocumentoSchema),
  saida: PortariaSaidaSchema.nullable().optional(),
});
export type PortariaEntradaDetalhe = z.infer<typeof PortariaEntradaDetalheSchema>;
