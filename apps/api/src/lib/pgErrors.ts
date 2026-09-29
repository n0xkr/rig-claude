/**
 * Traduz erros do Postgres/PostgREST (violação de unique/FK/check, uuid
 * inválido, overflow numérico) em um status HTTP + mensagem úteis, em vez de
 * deixar tudo cair no handler global como `500 Erro interno`. O client do
 * Supabase lança um objeto `PostgrestError` (não uma instância de `Error`)
 * com `code` (SQLSTATE), `message`, `details` e `hint`.
 */
export interface PgProblem {
  status: number;
  title: string;
  detail: string;
}

function isPgError(error: unknown): error is { code: string; message?: string; details?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

export function pgErrorToProblem(error: unknown): PgProblem | null {
  if (!isPgError(error)) return null;
  const constraint = /"([^"]+)"/.exec(error.message ?? '')?.[1];
  switch (error.code) {
    case '23505':
      return {
        status: 409,
        title: 'Conflito de estado',
        detail: `Já existe um registro com estes dados${constraint ? ` (${constraint})` : ''}`,
      };
    case '23503':
      return {
        status: 422,
        title: 'Referência inválida',
        detail: `Registro relacionado inexistente ou ainda em uso${constraint ? ` (${constraint})` : ''}`,
      };
    case '23502':
      return {
        status: 422,
        title: 'Campo obrigatório ausente',
        detail: error.message ?? 'Campo obrigatório ausente',
      };
    case '23514':
      return {
        status: 422,
        title: 'Valor fora do permitido',
        detail: `Um valor informado viola uma regra do banco${constraint ? ` (${constraint})` : ''}`,
      };
    case '22P02':
      return {
        status: 400,
        title: 'Requisição inválida',
        detail: 'Identificador ou valor em formato inválido',
      };
    case '22003':
      return {
        status: 422,
        title: 'Valor fora do permitido',
        detail: 'Um valor numérico informado excede o limite suportado',
      };
    case 'PGRST116':
      return {
        status: 404,
        title: 'Não encontrado',
        detail: 'Nenhum registro encontrado para a operação',
      };
    default:
      return null;
  }
}
