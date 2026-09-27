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

export const UpdateDocumentoEmbarqueSchema = CreateDocumentoEmbarqueSchema.partial();
export type UpdateDocumentoEmbarqueInput = z.infer<typeof UpdateDocumentoEmbarqueSchema>;
