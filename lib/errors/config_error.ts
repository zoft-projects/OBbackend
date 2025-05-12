import { BaseError } from './base_error';
import { ErrorSource } from '../enums/error_source';

export class ConfigurationError extends BaseError {
  constructor(message: string) {
    super(ErrorSource.CONFIGURATION, message);
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}
