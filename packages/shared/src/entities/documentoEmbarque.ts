import { z } from 'zod';
import { TipoDocumentoEmbarqueSchema } from '../enums.js';

export const DocumentoEmbarqueSchema = z.object({
  id: z.string().uuid(),
  viagem_id: z.string().uuid(),
  tipo_documento: TipoDocumentoEmbarqueSchema,
  numero_documento: z.string().nullable().optional(),
  url_arquivo: z.string().nullable().optional(),
  validado: z.boolean().default(false),
  validado_por: z.string().uuid().nullable().optional(),
  validado_em: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type DocumentoEmbarque = z.infer<typeof DocumentoEmbarqueSchema>;

export const CreateDocumentoEmbarqueSchema = DocumentoEmbarqueSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  validado_por: true,
  validado_em: true,
});
export type CreateDocumentoEmbarqueInput = z.infer<typeof CreateDocumentoEmbarqueSchema>;

/**
 * Payload de `POST /viagens/:viagemId/documentos` — igual ao de criação
 * direta, mas sem `viagem_id` (vem da URL). Bug real corrigido nesta sessão
 * (mesma classe de bug do Módulo 2 em `eventoFronteira.ts`): o controller
 * validava o body com `CreateDocumentoEmbarqueSchema` (que exige
 * `viagem_id`) ANTES de mesclar o `viagem_id` da URL, então essa rota
 * (única forma de criar um documento de embarque — não existe rota direta
 * de criação) sempre falhava com 422.
 */
export const CreateDocumentoEmbarqueNestedSchema = CreateDocumentoEmbarqueSchema.omit({
  viagem_id: true,
});
export type CreateDocumentoEmbarqueNestedInput = z.infer<
  typeof CreateDocumentoEmbarqueNestedSchema
>;

export const UpdateDocumentoEmbarqueSchema = CreateDocumentoEmbarqueSchema.partial();
export type UpdateDocumentoEmbarqueInput = z.infer<typeof UpdateDocumentoEmbarqueSchema>;
