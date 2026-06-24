// API callers branch on typed errors instead of HTTP status codes.

export class ValidationError extends Error {
  constructor(
    message: string,
    public details?: string[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
