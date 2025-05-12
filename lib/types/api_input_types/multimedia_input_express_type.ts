import { MultipartUploadPhaseEnum } from '../../enums';

type HttpPostMultimediaAttachmentInputType = {
  uploadId?: string;
  phase?: MultipartUploadPhaseEnum;
  multipart?: boolean;
  partsCount?: number;
  fileIdentifier?: string;
  uniqueFileName: string;
  featureName: string;
  uploadedParts?: {
    etag: string;
    partNumber: number;
  }[];
};

export { HttpPostMultimediaAttachmentInputType };
