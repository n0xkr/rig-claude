import { z } from 'zod';

/**
 * Solicitações da IA: ao importar uma planilha, a IA NUNCA grava direto nas
 * tabelas de negócio. Ela abre pedidos (CADASTRO/ATUALIZACAO) que o
 * administrador aprova ou recusa e PERGUNTAS quando não tem certeza do que um
 * dado significa. Regra de ouro: nunca supor — na dúvida, perguntar.
 */
export const IaEntidadeSchema = z.enum([
  'veiculos',
  'motoristas',
  'rastreadores',
  'clientes',
  'pontos_apoio',
  'coluna',
  'planilha',
]);
export type IaEntidade = z.infer<typeof IaEntidadeSchema>;

/** Entidades que têm tabela de cadastro (as demais são perguntas sobre a estrutura da planilha). */
export const ENTIDADES_CADASTRO = ['veiculos', 'motoristas', 'rastreadores', 'clientes', 'pontos_apoio'] as const;
export type EntidadeCadastro = (typeof ENTIDADES_CADASTRO)[number];

export const ENTIDADE_ROTULO: Record<IaEntidade, string> = {
  veiculos: 'Veículo',
  motoristas: 'Motorista',
  rastreadores: 'Rastreador',
  clientes: 'Cliente',
  pontos_apoio: 'Ponto de apoio',
  coluna: 'Coluna da planilha',
  planilha: 'Aba da planilha',
};

export const TipoSolicitacaoSchema = z.enum(['CADASTRO', 'ATUALIZACAO', 'PERGUNTA']);
export type TipoSolicitacao = z.infer<typeof TipoSolicitacaoSchema>;

export const StatusSolicitacaoSchema = z.enum(['PENDENTE', 'APROVADA', 'RECUSADA', 'RESPONDIDA', 'ERRO']);
export type StatusSolicitacao = z.infer<typeof StatusSolicitacaoSchema>;

/** Valores reservados de resposta. */
export const RESPOSTA_IGNORAR = '__ignorar__';
export const RESPOSTA_EXTRA = '__extra__';

export const OpcaoPerguntaSchema = z.object({ valor: z.string(), rotulo: z.string() });
export type OpcaoPergunta = z.infer<typeof OpcaoPerguntaSchema>;

export const SugestaoIaSchema = z.object({
  valor: z.string(),
  confianca: z.number().min(0).max(1),
  motivo: z.string().optional(),
});
export type SugestaoIa = z.infer<typeof SugestaoIaSchema>;

export const IaSolicitacaoSchema = z.object({
  id: z.string().uuid(),
  dataset_id: z.string().uuid().nullable().optional(),
  tipo: TipoSolicitacaoSchema,
  entidade: IaEntidadeSchema,
  titulo: z.string(),
  descricao: z.string().nullable().optional(),
  aba: z.string().nullable().optional(),
  linha: z.number().int().nullable().optional(),
  coluna: z.string().nullable().optional(),
  chave_natural: z.string().nullable().optional(),
  dados_propostos: z.record(z.unknown()).nullable().optional(),
  dados_atuais: z.record(z.unknown()).nullable().optional(),
  evidencia: z.record(z.unknown()).nullable().optional(),
  pergunta: z.string().nullable().optional(),
  campo_pergunta: z.string().nullable().optional(),
  entrada: z.enum(['OPCAO', 'TEXTO']).nullable().optional(),
  opcoes: z.array(OpcaoPerguntaSchema).nullable().optional(),
  sugestao_ia: SugestaoIaSchema.nullable().optional(),
  resposta: z.record(z.unknown()).nullable().optional(),
  status: StatusSolicitacaoSchema,
  erro: z.string().nullable().optional(),
  registro_id: z.string().uuid().nullable().optional(),
  decidido_por: z.string().uuid().nullable().optional(),
  decidido_em: z.string().nullable().optional(),
  created_at: z.string(),
  /** Calculado pela API: rótulo amigável de cada chave de `dados_propostos` (ex.: cnh_validade -> "CNH validade"). */
  rotulos_campos: z.record(z.string()).optional(),
});
export type IaSolicitacao = z.infer<typeof IaSolicitacaoSchema>;

// ---------------------------------------------------------------------------
// Lote de importação de planilha (várias abas) analisado pela IA
// ---------------------------------------------------------------------------
export const CriarLoteInputSchema = z.object({
  nome: z.string().trim().min(1).max(300),
  origem: z.enum(['EXCEL', 'CSV']).default('EXCEL'),
});
export type CriarLoteInput = z.infer<typeof CriarLoteInputSchema>;

export const AnalisarAbaInputSchema = z.object({
  aba: z.string().trim().min(1).max(200),
  cabecalhos: z.array(z.string()).min(1).max(300),
  /** Colunas cujo valor é FÓRMULA na planilha (derivadas): a IA não as cadastra, só as reporta. */
  colunasCalculadas: z.array(z.string()).max(300).default([]),
  linhas: z.array(z.record(z.unknown())).max(5000),
});
export type AnalisarAbaInput = z.infer<typeof AnalisarAbaInputSchema>;

export const AnalisarAbaResultSchema = z.object({
  aba: z.string(),
  /** 'informativa' = aba de documentação/derivada; 'nao_suportada' = reconhecida mas ainda sem cadastro; 'desconhecida' = a IA perguntou. */
  situacao: z.enum(['processada', 'informativa', 'nao_suportada', 'desconhecida']),
  entidade: z.string().nullable(),
  linhasLidas: z.number().int(),
  cadastros: z.number().int(),
  atualizacoes: z.number().int(),
  perguntas: z.number().int(),
  jaCadastrados: z.number().int(),
  colunasCalculadas: z.array(z.string()),
  avisos: z.array(z.string()),
});
export type AnalisarAbaResult = z.infer<typeof AnalisarAbaResultSchema>;

export const ListarSolicitacoesQuerySchema = z.object({
  status: StatusSolicitacaoSchema.optional(),
  /** Oculta um status (ex.: histórico = tudo menos PENDENTE). */
  excluirStatus: StatusSolicitacaoSchema.optional(),
  tipo: TipoSolicitacaoSchema.optional(),
  entidade: IaEntidadeSchema.optional(),
  datasetId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListarSolicitacoesQuery = z.infer<typeof ListarSolicitacoesQuerySchema>;

export const ResponderSolicitacaoInputSchema = z
  .object({
    opcao: z.string().min(1).max(200).optional(),
    texto: z.string().trim().min(1).max(500).optional(),
  })
  .refine((v) => v.opcao !== undefined || v.texto !== undefined, {
    message: 'Informe uma opção ou um texto',
  });
export type ResponderSolicitacaoInput = z.infer<typeof ResponderSolicitacaoInputSchema>;

export const RecusarSolicitacaoInputSchema = z.object({ motivo: z.string().trim().max(500).optional() });
export type RecusarSolicitacaoInput = z.infer<typeof RecusarSolicitacaoInputSchema>;

export const DecidirLoteInputSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
export type DecidirLoteInput = z.infer<typeof DecidirLoteInputSchema>;

export interface ResultadoDecisao {
  id: string;
  ok: boolean;
  status: StatusSolicitacao;
  erro?: string;
}

export interface ResumoSolicitacoes {
  pendentes: number;
  perguntas: number;
  cadastros: number;
  atualizacoes: number;
  erros: number;
}
