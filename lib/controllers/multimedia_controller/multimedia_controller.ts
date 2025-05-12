import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import multer from 'multer';
import { IAppConfig } from '../../config';
import { UserLevelEnum, MultipartUploadPhaseEnum } from '../../enums';
import { logError, logInfo, getLogger } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { multiMediaService } from '../../services';
import { MultimediaAttachmentPayloadType, HttpPostMultimediaAttachmentInputType } from '../../types';
import { BaseController } from '../base_controller';

const upload = multer({ storage: multer.memoryStorage() });
const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class MultimediaController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/multimedia`;
    this.router = express.Router();
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.post(
      `${this.basePath}/attachments`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      upload.single('file'),
      this.asyncHandler(this.multimediaFile.bind(this)),
    );
  }

  private multimediaFile = async (
    request: express.Request,
    response: express.Response<MultimediaAttachmentPayloadType>,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] multimediaFile initiated`);

    try {
      const {
        phase,
        uploadId,
        partsCount,
        fileIdentifier,
        uniqueFileName,
        multipart = false,
        uploadedParts,
        featureName,
      } = request.body as HttpPostMultimediaAttachmentInputType;

      if (!uniqueFileName) {
        throw new Error('Required fields are missing!');
      }

      const { file } = request;

      if (file && !phase && !multipart) {
        // Single file upload
        logInfo(`[${transactionId}] [CONTROLLER] multimediaFile Smaller file upload initiated`);

        const uploadedInfo = await multiMediaService.attachSmallAttachmentForMultimedia(
          transactionId,
          file,
          uniqueFileName,
          featureName,
        );

        response.status(HttpStatusCode.OK).json({
          fileIdentifier: uploadedInfo.fileIdentifier,
          attachmentUrl: uploadedInfo.signedUrl,
          featureName,
        });

        logInfo(`[${transactionId}] [CONTROLLER] multimediaFile Smaller file upload SUCCESSFUL`);

        return;
      }

      // Incorrect request scenario: Missing required fields for multipart upload

      if (file || !phase || !multipart || !uniqueFileName) {
        throw new Error('Required fields are missing!');
      }

      // Multipart large file upload
      logInfo(`[${transactionId}] [CONTROLLER] multimediaFile Large file upload initiated, phase: ${phase}`);

      // TODO: Use a util/helper to validate if fileExtension is compatible with the mimetype
      const fileExtension = uniqueFileName.split('.').pop();
      if (fileExtension) {
        logInfo(
          `[${transactionId}] [CONTROLLER] multimediaFile Large file upload for file extension: ${fileExtension}`,
        );
      }

      if (phase === MultipartUploadPhaseEnum.create && partsCount) {
        const uploadParams = await multiMediaService.initiateLargeAttachmentForMultimedia(
          transactionId,
          uniqueFileName,
          partsCount,
          featureName,
        );

        response.status(HttpStatusCode.OK).json({
          fileIdentifier: uploadParams.fileIdentifier,
          signedUrls: uploadParams.signedUrls,
          uploadUrls: uploadParams.signedUrls,
          uploadId: uploadParams.uploadId,
          featureName,
        });
        logInfo(`[${transactionId}] [CONTROLLER] multimediaFile Large file upload SUCCESSFUL for phase: ${phase}`);

        return;
      }

      if (phase === MultipartUploadPhaseEnum.complete && uploadId && uploadedParts && fileIdentifier) {
        const attachedUrl = await multiMediaService.finalizeLargeAttachmentForMultimedia(
          transactionId,
          fileIdentifier,
          {
            uploadId,
            uploadedParts,
          },
        );

        response.status(HttpStatusCode.OK).json({
          fileIdentifier,
          attachmentUrl: attachedUrl,
          featureName,
        });

        logInfo(`[${transactionId}] [CONTROLLER] multimediaFile Large file upload SUCCESSFUL for phase: ${phase}`);

        return;
      }

      throw new Error('Unexpected phase');
    } catch (attachErr) {
      logError(`[${transactionId}] [CONTROLLER] multimediaFile FAILED, reason: ${attachErr.message}`);

      next(attachErr);
    }
  };
}
