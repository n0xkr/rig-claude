import { ConflictError, DomainError } from '../../lib/errors.js';

/** Erro do PostgREST/Postgres como devolvido pelo supabase-js (`code` = SQLSTATE ou código PGRST). */
interface PgErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
}

/** Mensagens amigáveis por índice/constraint único do banco real (ver db_schema: uniques parciais com `deleted_at IS NULL`). */
const MENSAGENS_UNICO: Record<string, string> = {
  idx_depositantes_cnpj_cpf: 'Já existe um depositante ativo com este CNPJ/CPF',
  idx_produtos_armazenados_depositante_sku: 'Já existe um produto com este SKU para o depositante',
  idx_enderecos_armazem_posicao:
    'Já existe um endereço com esta área/rua/prateleira/posição neste armazém',
  idx_estoque_produto_endereco: 'Já existe saldo registrado para este produto neste endereço',
};

/**
 * Traduz violações de constraint do Postgres (unique 23505, FK 23503, check
 * 23514, NOT NULL 23502) em `DomainError` (409/422) com mensagem útil, em vez
 * de deixar virar um 500 genérico no error handler global. Qualquer outro erro
 * é devolvido intacto (para ser relançado e logado como erro real — nunca
 * escondido como 404/lista vazia).
 */
export function mapPgError(error: unknown): unknown {
  const pg = error as PgErrorLike | null;
  if (!pg || typeof pg !== 'object' || !pg.code) return error;
  const texto = `${pg.message ?? ''} ${pg.details ?? ''}`;

  if (pg.code === '23505') {
    const indice = Object.keys(MENSAGENS_UNICO).find((nome) => texto.includes(nome));
    return new ConflictError(
      indice ? MENSAGENS_UNICO[indice]! : 'Registro duplicado (violação de unicidade)',
    );
  }
  if (pg.code === '23503') {
    return new DomainError(
      'Referência inválida',
      422,
      'O registro referencia (ou é referenciado por) outro registro inexistente/em uso',
    );
  }
  if (pg.code === '23514') {
    return new DomainError('Valor inválido', 422, 'Um valor informado viola uma regra do banco');
  }
  if (pg.code === '23502') {
    return new DomainError('Campo obrigatório ausente', 422, pg.message);
  }
  return error;
}
