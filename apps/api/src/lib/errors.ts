export class DomainError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} não encontrado`, 404, `Nenhum registro de ${entity} com id ${id}`);
  }
}

export class ConflictError extends DomainError {
  constructor(detail: string) {
    super('Conflito de estado', 409, detail);
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(
      'Transição de status inválida',
      422,
      `Não é permitido transicionar de "${from}" para "${to}"`,
    );
  }
}

/**
 * Transição de máquina de estados que é estruturalmente válida (existe no
 * grafo de transições), mas que o papel (role) do usuário autenticado não
 * está autorizado a executar — ex: um OPERADOR tentando aprovar
 * financeiramente um frete (Módulo 3, critério #4). Diferente de
 * `InvalidStateTransitionError` (422, transição inexistente), este é um 403
 * (permissão), reforçando o RBAC já aplicado nas policies de RLS.
 */
export class ForbiddenTransitionError extends DomainError {
  constructor(detail: string) {
    super('Ação não permitida para o seu perfil', 403, detail);
  }
}
