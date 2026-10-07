import { ConflictError, DomainError } from './errors.js';

/** Formato mínimo do erro devolvido pelo PostgREST/supabase-js. */
interface PgLikeError {
  code?: string;
  message?: string;
  details?: string | null;
}

/**
 * Mensagens amigáveis para as constraints reais do banco (unique/FK/check) do
 * TMS (viagens/veículos/motoristas/apólices/documentos/eventos). Chave = nome
 * da constraint (aparece na `message` do erro do Postgres).
 */
const MENSAGENS_CONSTRAINT: Record<string, string> = {
  veiculos_placa_key: 'Já existe um veículo com esta placa (inclusive um veículo removido)',
  motoristas_cpf_key: 'Já existe um motorista com este CPF (inclusive um motorista removido)',
  viagens_numero_crt_key:
    'Já existe uma viagem com este número de CRT (inclusive uma viagem removida)',
  viagens_placa_cavalo_fkey: 'A placa do cavalo informada não está cadastrada em Veículos',
  viagens_veiculo_id_fkey: 'O veículo informado não existe',
  viagens_motorista_id_fkey: 'O motorista informado não existe',
  viagens_depositante_id_fkey: 'O depositante informado não existe',
  chk_apolice_vigencia: 'A vigência final deve ser maior ou igual à vigência inicial',
  chk_apolice_vinculo: 'A apólice deve estar vinculada a um veículo ou a uma viagem',
  apolices_seguro_veiculo_id_fkey: 'O veículo informado não existe',
  apolices_seguro_viagem_id_fkey: 'A viagem informada não existe',
  documentos_embarque_viagem_id_fkey: 'A viagem informada não existe',
  eventos_risco_viagem_id_fkey: 'A viagem informada não existe',
  eventos_fronteira_viagem_id_fkey: 'A viagem informada não existe',
  chk_viagens_km_rodado: 'km_rodado deve ser maior ou igual a zero',
  chk_viagens_km_vazio: 'km_vazio deve ser maior ou igual a zero',
  chk_viagens_consumo: 'consumo_combustivel_litros deve ser maior ou igual a zero',
};

/**
 * Converte um erro de constraint do Postgres (23505 unique, 23503 FK, 23514
 * check, 23502 not null, 22P02/22007/22008 formato inválido) em um
 * `DomainError` com status/mensagem úteis (409/422), em vez de deixar o
 * handler global responder 500 genérico. Erros desconhecidos são devolvidos
 * intactos para o chamador relançar: `throw fromPgError(error)`.
 */
export function fromPgError(error: unknown): unknown {
  const pg = error as PgLikeError | null;
  if (!pg || typeof pg !== 'object' || typeof pg.code !== 'string') return error;

  const constraint = /constraint "([^"]+)"/.exec(pg.message ?? '')?.[1];
  const amigavel = constraint ? MENSAGENS_CONSTRAINT[constraint] : undefined;
  const detalhe = pg.details ?? pg.message ?? undefined;

  switch (pg.code) {
    case '23505':
      return new ConflictError(amigavel ?? `Registro duplicado: ${detalhe ?? 'valor já existe'}`);
    case '23503':
      return new DomainError(
        'Referência inválida',
        422,
        amigavel ?? `Registro referenciado não existe ou ainda é referenciado: ${detalhe ?? ''}`,
      );
    case '23514':
      return new DomainError('Valor inválido', 422, amigavel ?? pg.message);
    case '23502':
      return new DomainError('Campo obrigatório ausente', 422, pg.message);
    case '22P02':
    case '22007':
    case '22008':
      return new DomainError('Formato de valor inválido', 422, pg.message);
    default:
      return error;
  }
}
