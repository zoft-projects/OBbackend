import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import { validationResult } from 'express-validator';
import { IEnvConfig } from '../config';
import { RequestValidationError } from '../errors/request_validation_error';
import { logInfo } from '../log/util';

export abstract class BaseController {
  protected API_BASE_URL: string;
  public router: express.Router;

  constructor(envConfig: IEnvConfig) {
    this.API_BASE_URL = envConfig.apiBase;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  protected asyncHandler =
    (fn: RequestHandler) =>
    (req: Request, res: Response, next: NextFunction): Promise<any> => {
      logInfo(`[transactionId] ${req.txId}:`);

      this.validateRequest(req);

      return Promise.resolve(fn(req, res, next)).catch(next);
    };

  public abstract getBasePath(): string;

  private validateRequest(request: express.Request): void {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new RequestValidationError(errors.array());
    }
  }
}
