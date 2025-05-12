import { BaseError } from './base_error';
import { ErrorSource } from '../enums/error_source';
import { HttpStatusCode } from '../enums/http_status_code';

export class AuthError extends BaseError {
  constructor(message: string) {
    super(ErrorSource.VALIDATION, message);
    this.statusCode = HttpStatusCode.UNAUTHORIZED;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}
