/** Base for errors that carry an HTTP status. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number = 500,
    readonly code: string = "internal_error",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "validation_error", details);
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super(`${what} not found`, 404, "not_found");
  }
}

export class ProviderError extends AppError {
  constructor(
    readonly provider: string,
    message: string,
    readonly retryable = true,
  ) {
    super(`[${provider}] ${message}`, 502, "provider_error");
  }
}

/** A stage produced output that violates its own contract. */
export class StageContractError extends AppError {
  constructor(stage: string, direction: "input" | "output", details: unknown) {
    super(`Stage ${stage} ${direction} violated its schema`, 500, "stage_contract_error", details);
  }
}
