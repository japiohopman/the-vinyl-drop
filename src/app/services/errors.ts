export class AuthorizationError extends Error {
  constructor(message = 'Forbidden: You do not have permission to perform this action') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class DatabaseError extends Error {
  public readonly code?: string;
  public readonly severity?: string;

  constructor(
    message = 'Database operation failed',
    options?: { code?: string; severity?: string; cause?: unknown }
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.code = options?.code;
    this.severity = options?.severity;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}
