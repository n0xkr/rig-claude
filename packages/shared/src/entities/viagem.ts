import { z } from 'zod';
import { PAISES_HABILITADOS, StatusViagemSchema } from '../enums.js';

/** Destino da viagem: países do Mercosul habilitados ou BR (viagem nacional). */
export const PaisDestinoViagemSchema = z.enum([...PAISES_HABILITADOS, 'BR']);
export type PaisDestinoViagem = z.infer<typeof PaisDestinoViagemSchema>;

/** Documento que acompanha a carga: CRT (internacional) ou DANFE/NF-e (nacional). */
export const TipoDocumentoCargaSchema = z.enum(['CRT', 'DANFE', 'OUTRO']);
export type TipoDocumentoCarga = z.infer<typeof TipoDocumentoCargaSchema>;

/**
 * Uma carga da viagem: cada CRT/DANFE com sua mercadoria, tipo, peso e valor.
 * Uma viagem pode levar vários documentos (migration 0014, `viagem_cargas`).
 */
export const ViagemCargaSchema = z.object({
  id: z.string().uuid(),
  viagem_id: z.string().uuid(),
  tipo_documento: TipoDocumentoCargaSchema.default('CRT'),
  numero_documento: z.string().min(1).max(80),
  mercadoria: z.string().nullable().optional(),
  tipo_mercadoria: z.string().nullable().optional(),
  peso_kg: z.number().nonnegative().nullable().optional(),
  valor_mercadoria: z.number().nonnegative().nullable().optional(),
  moeda: z.string().max(3).nullable().optional(),
  observacoes: z.string().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
});
export type ViagemCarga = z.infer<typeof ViagemCargaSchema>;

export const ViagemCargaInputSchema = ViagemCargaSchema.omit({
  id: true,
  viagem_id: true,
  created_at: true,
  updated_at: true,
});
export type ViagemCargaInput = z.infer<typeof ViagemCargaInputSchema>;

/** Troca de motorista: quem era, quem ficou, quando e por quê (migration 0014). */
export const ViagemMotoristaHistoricoSchema = z.object({
  id: z.string().uuid(),
  viagem_id: z.string().uuid(),
  motorista_anterior_id: z.string().uuid().nullable(),
  motorista_novo_id: z.string().uuid().nullable(),
  motivo: z.string().nullable().optional(),
  changed_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  motorista_anterior_nome: z.string().nullable().optional(),
  motorista_novo_nome: z.string().nullable().optional(),
});
export type ViagemMotoristaHistorico = z.infer<typeof ViagemMotoristaHistoricoSchema>;

const placa = z
  .string()
  .trim()
  .min(6)
  .max(8)
  .transform((p) => p.toUpperCase().replace(/[\s-]/g, ''));

export const ViagemSchema = z.object({
  id: z.string().uuid(),
  /** Código da viagem na planilha de origem (ex: "RGB-2026-0412"): chave da reimportação. */
  codigo_externo: z.string().nullable().optional(),
  /** Documento principal (primeiro CRT/DANFE) — os demais ficam em `cargas`. */
  numero_crt: z.string().nullable().optional(),
  numero_mic_dta: z.string().nullable().optional(),
  placa_cavalo: z.string().min(6).max(8),
  placa_carreta: z.string().max(8).nullable().optional(),
  placa_carreta_2: z.string().max(8).nullable().optional(),
  veiculo_id: z.string().uuid().nullable().optional(),
  motorista_id: z.string().uuid().nullable().optional(),
  status: StatusViagemSchema.default('PROGRAMADA'),
  cliente: z.string().nullable().optional(),
  origem: z.string().min(2),
  destino: z.string().min(2),
  pais_destino: PaisDestinoViagemSchema.nullable().optional(),
  mercadoria: z.string().nullable().optional(),
  tipo_mercadoria: z.string().nullable().optional(),
  /** Pesquisa/consulta do motorista e veículo na GR/seguradora concluída. */
  pesquisa_ok: z.boolean().optional(),
  checklist_ok: z.boolean().optional(),
  smp_ok: z.boolean().optional(),
  /** Data/hora prevista de início. No futuro = viagem agendada. */
  data_programacao: z.string().datetime().optional(),
  data_ordem_coleta: z.string().datetime().nullable().optional(),
  data_coleta: z.string().datetime().nullable().optional(),
  data_inicio_viagem: z.string().datetime().nullable().optional(),
  data_chegada_fronteira: z.string().datetime().nullable().optional(),
  data_liberacao_fronteira: z.string().datetime().nullable().optional(),
  data_entrega: z.string().datetime().nullable().optional(),
  data_encerramento: z.string().datetime().nullable().optional(),
  peso_kg: z.number().nonnegative().nullable().optional(),
  valor_frete: z.number().nonnegative().nullable().optional(),
  valor_mercadoria: z.number().nonnegative().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  /** Informações da planilha sem campo próprio (guardadas, nunca descartadas). */
  dados_extras: z.record(z.unknown()).nullable().optional(),
  /**
   * Módulo 6 (Integração TMS+WMS): sinaliza que o destino final desta
   * viagem é o Armazém Geral da Rigabras (e não um cliente externo),
   * habilitando a criação automática de um `recebimento` do Módulo 5
   * quando a carga for entregue.
   */
  destino_armazem_rigabras: z.boolean().optional(),
  /**
   * Módulo 6: depositante (Módulo 5) dono da carga transportada nesta
   * viagem — necessário para a automação de recebimento acima.
   */
  depositante_id: z.string().uuid().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
  /** Só na leitura de uma viagem (GET /viagens/:id). */
  cargas: z.array(ViagemCargaSchema).optional(),
});
export type Viagem = z.infer<typeof ViagemSchema>;

const baseEscrita = ViagemSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  created_by: true,
  cargas: true,
}).extend({
  placa_carreta: placa.nullable().optional(),
  placa_carreta_2: placa.nullable().optional(),
  cargas: z.array(ViagemCargaInputSchema).max(50).optional(),
});

/** Cadastro pela tela: motorista é obrigatório (pode ser trocado depois, com motivo). */
export const CreateViagemSchema = baseEscrita.extend({
  motorista_id: z.string({ required_error: 'Motorista é obrigatório' }).uuid('Motorista é obrigatório'),
});
export type CreateViagemInput = z.infer<typeof CreateViagemSchema>;

/** Importação de planilha: nem toda planilha traz o motorista. */
export const ImportViagemSchema = baseEscrita;
export type ImportViagemInput = z.infer<typeof ImportViagemSchema>;

export const UpdateViagemSchema = baseEscrita.partial().extend({
  /** Obrigatório quando `motorista_id` muda. */
  motivo_troca_motorista: z.string().trim().min(3).max(500).optional(),
});
export type UpdateViagemInput = z.infer<typeof UpdateViagemSchema>;

export const TrocarMotoristaViagemSchema = z.object({
  motorista_id: z.string().uuid(),
  motivo: z.string().trim().min(3, 'Informe o motivo da troca').max(500),
});
export type TrocarMotoristaViagemInput = z.infer<typeof TrocarMotoristaViagemSchema>;

export const ChangeStatusViagemSchema = z.object({
  status: StatusViagemSchema,
  observacoes: z.string().nullable().optional(),
});
export type ChangeStatusViagemInput = z.infer<typeof ChangeStatusViagemSchema>;

/** Viagem ainda não iniciada e com início previsto no futuro. */
export function viagemAgendada(v: Pick<Viagem, 'status' | 'data_programacao'>, agora = Date.now()) {
  return (
    v.status === 'PROGRAMADA' &&
    !!v.data_programacao &&
    Date.parse(v.data_programacao) > agora
  );
}
