import { z } from 'zod';

/**
 * Payload enviado ao endpoint de análise de risco via Groq, e o formato
 * estruturado de resposta esperado (parse do JSON retornado pelo modelo).
 */
export const RiskAnalysisRequestSchema = z.object({
  viagemId: z.string().uuid(),
});
export type RiskAnalysisRequest = z.infer<typeof RiskAnalysisRequestSchema>;

export const RiskAnalysisResultSchema = z.object({
  riskLevel: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']),
  isAnomaly: z.boolean(),
  reasoning: z.string(),
  recommendedActions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type RiskAnalysisResult = z.infer<typeof RiskAnalysisResultSchema>;
