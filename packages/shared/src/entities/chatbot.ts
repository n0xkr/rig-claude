import { z } from 'zod';

/**
 * RIGABRAS AI (Módulo 10) — assistente operacional conversacional. Regra de
 * ouro (documento de evolução, seção 29): a IA responde EXCLUSIVAMENTE a
 * partir de um snapshot de dados reais montado pelo backend antes de
 * chamar o modelo — nunca a partir do próprio conhecimento do modelo, nunca
 * inventando números. `fontesDados` sempre lista de onde o snapshot veio,
 * para rastreabilidade.
 */
export const PerguntaChatbotSchema = z.object({
  pergunta: z.string().min(3).max(500),
});
export type PerguntaChatbotInput = z.infer<typeof PerguntaChatbotSchema>;

export const RespostaChatbotSchema = z.object({
  resposta: z.string(),
  fontesDados: z.array(z.string()),
  geradoEm: z.string().datetime(),
});
export type RespostaChatbot = z.infer<typeof RespostaChatbotSchema>;
