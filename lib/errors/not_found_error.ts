import { BaseError } from './base_error';
import { ErrorSource } from '../enums/error_source';
import { HttpStatusCode } from '../enums/http_status_code';

export class NotFoundError extends BaseError {
  constructor(message: string) {
    super(ErrorSource.VALIDATION, message);
    this.statusCode = HttpStatusCode.NOT_FOUND;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}
