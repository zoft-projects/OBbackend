import { BaseError } from './base_error';
import { ErrorSource } from '../enums/error_source';
import { HttpStatusCode } from '../enums/http_status_code';

export class RequestValidationError extends BaseError {
  constructor(errors: Record<string, unknown>[]) {
    super(ErrorSource.VALIDATION, 'Bad Request');
    this.statusCode = HttpStatusCode.BAD_REQUEST;
    this.errors = errors;
    Object.setPrototypeOf(this, RequestValidationError.prototype);
  }
}
