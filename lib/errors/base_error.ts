import { ErrorSource } from '../enums/error_source';
import { HttpStatusCode } from '../enums/http_status_code';

export abstract class BaseError extends Error {
  public statusCode: number;
  public appErr = true;
  public source: ErrorSource;
  public errors: Record<string, unknown>[];

  constructor(errorSource: ErrorSource, message: string, stack?: string) {
    super(message);

    Object.setPrototypeOf(this, BaseError.prototype);

    this.source = errorSource;
    this.statusCode = HttpStatusCode.INTERNAL_SERVER_ERROR;

    if (stack) {
      this.stack = stack;
    }
  }
}
