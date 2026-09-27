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
