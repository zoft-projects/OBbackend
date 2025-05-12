import { BaseError } from './base_error';
import { ErrorSource } from '../enums/error_source';
import { HttpStatusCode } from '../enums/http_status_code';

export class ValidationError extends BaseError {
  constructor(message: string) {
    super(ErrorSource.VALIDATION, message);
    this.statusCode = HttpStatusCode.BAD_REQUEST;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
