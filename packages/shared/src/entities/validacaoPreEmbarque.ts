import { z } from 'zod';
import { SeveridadeAchadoValidacaoSchema } from '../enums.js';

/**
 * Um achado (finding) individual da validação cruzada pré-embarque
 * (Módulo 2, critério #3): CRT x Fatura x MIC/DTA x dados do veículo x dados
 * da viagem. Retorna lista estruturada de inconsistências, não apenas um
 * booleano.
 */
export const AchadoValidacaoSchema = z.object({
  campo: z.string(),
  severidade: SeveridadeAchadoValidacaoSchema,
  mensagem: z.string(),
  valorEsperado: z.string().nullable().optional(),
  valorEncontrado: z.string().nullable().optional(),
});
export type AchadoValidacao = z.infer<typeof AchadoValidacaoSchema>;

/** Payload enviado pelo operador para disparar o cross-check pré-embarque. */
export const ValidarPreEmbarqueInputSchema = z.object({
  fatura_numero: z.string().nullable().optional(),
  fatura_valor: z.number().nonnegative().nullable().optional(),
  mic_dta_numero: z.string().nullable().optional(),
  placa_declarada: z.string().nullable().optional(),
});
export type ValidarPreEmbarqueInput = z.infer<typeof ValidarPreEmbarqueInputSchema>;

export const ResultadoValidacaoPreEmbarqueSchema = z.object({
  viagem_id: z.string().uuid(),
  aprovado: z.boolean(),
  gerado_em: z.string().datetime(),
  achados: z.array(AchadoValidacaoSchema),
  documentos_verificados: z.array(z.string()),
  documentos_faltantes: z.array(z.string()),
});
export type ResultadoValidacaoPreEmbarque = z.infer<typeof ResultadoValidacaoPreEmbarqueSchema>;
