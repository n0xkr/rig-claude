import { z } from 'zod';
import { StatusFechamentoFreteSchema } from '../enums.js';

/**
 * Frete contratado de uma viagem (Módulo 3, critério #1 — "Frete
 * contratado"). Relação 1:1 com `viagens` (índice único parcial em
 * `viagem_id` no banco): cada viagem encerrada tem um único frete a passar
 * pelo fechamento financeiro.
 *
 * Também carrega os dados do "frete de retorno vazio" (critério #4):
 * `retorno_vazio` indica se o trecho de volta do veículo roda vazio (true,
 * padrão) ou com carga de retorno/backhaul (false); `valor_custo_retorno_vazio`
 * estima o custo de rodar vazio e `valor_frete_retorno` registra o valor do
 * frete de retorno quando há backhaul. Esses dados alimentam os indicadores
 * de eficiência de frota do Módulo 4 (km vazio, ocupação), sem implementá-los
 * aqui.
 */
export const FreteSchema = z.object({
  id: z.string().uuid(),
  viagem_id: z.string().uuid(),
  numero_fatura: z.string().nullable().optional(),
  valor_contratado: z.number().nonnegative(),
  retorno_vazio: z.boolean().default(true),
  valor_custo_retorno_vazio: z.number().nonnegative().nullable().optional(),
  valor_frete_retorno: z.number().nonnegative().nullable().optional(),
  status_fechamento: StatusFechamentoFreteSchema.default('ABERTO'),
  aprovado_por: z.string().uuid().nullable().optional(),
  aprovado_em: z.string().datetime().nullable().optional(),
  pago_por: z.string().uuid().nullable().optional(),
  pago_em: z.string().datetime().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});
export type Frete = z.infer<typeof FreteSchema>;

function checkRetornoVazio(data: {
  retorno_vazio: boolean;
  valor_frete_retorno?: number | null;
}): boolean {
  return data.retorno_vazio || Boolean(data.valor_frete_retorno);
}
const RETORNO_VAZIO_ISSUE = {
  message: 'valor_frete_retorno é obrigatório quando retorno_vazio = false (há carga de backhaul)',
  path: ['valor_frete_retorno'],
};

/** Base do payload de criação, sem o refinement — usada tanto pela rota direta (`POST /fretes`) quanto pela aninhada (`POST /viagens/:viagemId/frete`, que injeta `viagem_id` a partir da URL e por isso omite o campo do body). */
export const CreateFreteBaseSchema = z.object({
  viagem_id: z.string().uuid(),
  numero_fatura: z.string().nullable().optional(),
  valor_contratado: z.number().nonnegative(),
  retorno_vazio: z.boolean().default(true),
  valor_custo_retorno_vazio: z.number().nonnegative().nullable().optional(),
  valor_frete_retorno: z.number().nonnegative().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});

export const CreateFreteSchema = CreateFreteBaseSchema.refine(
  checkRetornoVazio,
  RETORNO_VAZIO_ISSUE,
);
export type CreateFreteInput = z.infer<typeof CreateFreteSchema>;

/** Payload de `POST /viagens/:viagemId/frete` — igual ao de criação direta, mas sem `viagem_id` (vem da URL). */
export const CreateFreteNestedSchema = CreateFreteBaseSchema.omit({ viagem_id: true }).refine(
  checkRetornoVazio,
  RETORNO_VAZIO_ISSUE,
);
export type CreateFreteNestedInput = z.infer<typeof CreateFreteNestedSchema>;

/**
 * Atualização do cabeçalho comercial do frete. `status_fechamento` é
 * propositalmente omitido: toda transição de estado passa pelo endpoint
 * dedicado (`PATCH /fretes/:id/status`), que aplica a máquina de estados e
 * o RBAC por transição (critério #1), nunca por um PATCH genérico.
 */
export const UpdateFreteSchema = z.object({
  numero_fatura: z.string().nullable().optional(),
  valor_contratado: z.number().nonnegative().optional(),
  retorno_vazio: z.boolean().optional(),
  valor_custo_retorno_vazio: z.number().nonnegative().nullable().optional(),
  valor_frete_retorno: z.number().nonnegative().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});
export type UpdateFreteInput = z.infer<typeof UpdateFreteSchema>;

export const ChangeStatusFreteSchema = z.object({
  status: StatusFechamentoFreteSchema,
  observacoes: z.string().nullable().optional(),
});
export type ChangeStatusFreteInput = z.infer<typeof ChangeStatusFreteSchema>;

/**
 * Saldo do frete (critério #3): frete contratado menos adiantamentos,
 * descontos, multas e pagamentos já confirmados — "o que ainda é devido".
 * Calculado dinamicamente pelo serviço a partir de `frete_lancamentos` e
 * `pagamentos_frete` (nunca persistido, para nunca ficar desatualizado).
 */
export const SaldoFreteSchema = z.object({
  frete_id: z.string().uuid(),
  valor_contratado: z.number(),
  total_adiantamentos: z.number().nonnegative(),
  total_descontos: z.number().nonnegative(),
  total_multas: z.number().nonnegative(),
  total_pago_confirmado: z.number().nonnegative(),
  saldo: z.number(),
});
export type SaldoFrete = z.infer<typeof SaldoFreteSchema>;
