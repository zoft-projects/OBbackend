import { NextFunction } from 'connect';
import express from 'express';
import { IAppConfig } from '../../config';
import { HttpStatusCode } from '../../enums';
import { logError, logInfo, logWarn } from '../../log/util';
import { anonymizedInfoService } from '../../services';
import { OBAnonymizedInfoCreateOperationType } from '../../types';
import { BaseController } from '../base_controller';

export class AnonUserController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/anon`;
    this.router = express.Router();
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.post(this.basePath, this.asyncHandler(this.createAnonEntry.bind(this)));
  }

  private createAnonEntry = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] [AnonEntry] Create anon entry initiated`);

    try {
      const { body }: { body: Partial<OBAnonymizedInfoCreateOperationType> } = request;

      // Check if all required fields are present
      if (!body.identifier || !body.infoKey || !body.infoValue || !body.infoType) {
        return response.status(HttpStatusCode.BAD_REQUEST).send({
          success: false,
          message: 'Missing required fields: identifier, infoKey, infoValue, infoType',
        });
      }

      const previousAnonEntry = await anonymizedInfoService.getPreviousAnonEntryByIdAndKeyType(transactionId, {
        identifier: body.identifier,
        infoKey: body.infoKey,
        infoType: body.infoType,
      });

      // Create a new anonymized info entry with the provided data
      const createData: OBAnonymizedInfoCreateOperationType = {
        identifier: previousAnonEntry ? `${body.identifier}_v_${Date.now()}` : body.identifier,
        infoKey: body.infoKey,
        infoValue: body.infoValue,
        infoType: body.infoType,
      };

      if (body.requestIp) {
        createData.requestIp = body.requestIp;
      }
      if (body.requestDeviceInfo) {
        createData.requestDeviceInfo = body.requestDeviceInfo;
      }

      try {
        const result = await anonymizedInfoService.createOBAnonymizedInfo(transactionId, createData);

        // Send a success response with the new entry's identifier
        response.status(HttpStatusCode.OK).send({
          success: true,
          message: 'Thank you for sending your request. All the best!',
          identifier: result.identifier,
        });
      } catch (dupErr) {
        logWarn(
          `[${transactionId}] [CONTROLLER] [AnonEntry] Create anon entry duplicate error, reason: ${dupErr.message}`,
        );

        response.status(HttpStatusCode.OK).send({
          success: true,
          message: 'Thank you for sending your request. We did find a previous request for this as well. All the best!',
          identifier: body.identifier,
        });
      }
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [AnonEntry] Create anon entry error, reason: ${error.message}`);

      next(error);
    }
  };
}
