import { z } from 'zod';
import { ExpedicaoSchema } from './expedicao.js';
import { RecebimentoSchema } from './recebimento.js';

/**
 * Módulo 6 (Integração TMS + WMS) — status cruzado de uma viagem: qual
 * expedição e/ou recebimento do armazém (Módulo 5) estão vinculados a ela, e
 * em que estado cada um se encontra. Consumido por `GET /viagens/:id/wms-status`
 * e usado pela `ViagemDetailPage` para exibir os eventos/registros do WMS
 * ligados à viagem.
 */
export const ViagemWmsStatusSchema = z.object({
  viagem_id: z.string().uuid(),
  expedicao: ExpedicaoSchema.nullable(),
  recebimento: RecebimentoSchema.nullable(),
});
export type ViagemWmsStatus = z.infer<typeof ViagemWmsStatusSchema>;
