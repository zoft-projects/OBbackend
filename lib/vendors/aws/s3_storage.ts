import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommandInput,
  PutObjectCommand,
  GetObjectCommand,
  GetObjectCommandInput,
  UploadPartCommand,
  UploadPartCommandInput,
  CreateMultipartUploadCommand,
  CreateMultipartUploadCommandInput,
  CreateMultipartUploadCommandOutput,
  CompleteMultipartUploadCommandInput,
  CompleteMultipartUploadCommandOutput,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  AbortMultipartUploadCommandInput,
  PutObjectCommandOutput,
  DeleteObjectCommandOutput,
  DeleteObjectCommandInput,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from 'config';
import ms from 'ms';
import { logInfo, logError, logDebug } from '../../log/util';
import { MultipartFileCreateInS3Type, MultipartFileCompleteInS3Type } from '../../types';

const s3Config: { bucketName: string; signedUrlExpiryTime: number; region: string } = config.get('Services.s3');

const s3ClientLocal = new S3Client({ region: s3Config.region });
const expirationTime: number = Math.floor(ms('72h') / 1000);
const expirationTimeForUpload: number = Math.floor(ms('10m') / 1000);

type UploadFileS3Type = {
  content: Buffer;
  fileName: string;
  contentType?: string;
  contentEncoding?: string;
};

const uploadFileToS3 = async (
  txId: string,
  uploadData: UploadFileS3Type,
): Promise<PutObjectCommandOutput & { versionId?: string }> => {
  try {
    const s3Input: PutObjectCommandInput = {
      Bucket: s3Config.bucketName,
      Key: uploadData.fileName,
      Body: uploadData.content,
      ContentEncoding: uploadData.contentEncoding,
      ContentType: uploadData.contentType,
    };

    // Upload the file to S3
    const response = await s3ClientLocal.send(new PutObjectCommand(s3Input));

    return { ...response, versionId: response.VersionId };
  } catch (err) {
    logError(`[${txId}] [ONEBAYSHORE-S3-SERVICE] Error occurred while uploading a file to s3, error: ${err.message}`);
    throw err;
  }
};

const deleteFileFromS3 = async (
  txId: string,
  fileName: string,
  permanentlyDelete = false,
  versionId?: string,
): Promise<DeleteObjectCommandOutput> => {
  try {
    const s3Input: DeleteObjectCommandInput = {
      Bucket: s3Config.bucketName,
      Key: fileName,
    };

    logDebug(`[${txId}] [ONEBAYSHORE-S3-SERVICE] file: ${fileName} set to be deleted`);

    if (permanentlyDelete && versionId) {
      s3Input.VersionId = versionId;
      logDebug(`[${txId}] [ONEBAYSHORE-S3-SERVICE] versionId of file: ${versionId} set to be deleted`);
    }

    const response = await s3ClientLocal.send(new DeleteObjectCommand(s3Input));

    return response;
  } catch (err) {
    logError(`[${txId}] [ONEBAYSHORE-S3-SERVICE] Error occurred while deleting a file from s3, error: ${err.message}`);
    throw err;
  }
};

const createPresignedUrlWithClient = async (
  txId: string,
  fileName: string,
  expiresIn: number = s3Config.signedUrlExpiryTime,
): Promise<string> => {
  try {
    const command = new GetObjectCommand({ Bucket: s3Config.bucketName, Key: fileName });

    return await getSignedUrl(s3ClientLocal, command, { expiresIn });
  } catch (err) {
    logError(
      `[${txId}] [ONEBAYSHORE-S3-SERVICE] Error occurred while creating a presigned url for fileName : ${fileName}, error: ${err.message}`,
    );

    throw err;
  }
};

const getReadableStreamFromS3Object = async (txId: string, fileName: string): Promise<Readable> => {
  try {
    const getObjectParams = { Bucket: s3Config.bucketName, Key: fileName };
    const getObjectCommand = new GetObjectCommand(getObjectParams);
    const objectStream = await s3ClientLocal.send(getObjectCommand);

    return objectStream.Body as Readable;
  } catch (err) {
    logError(
      `[${txId}] [ONEBAYSHORE-S3-SERVICE] Error occurred while generating a s3 url for fileName : ${fileName}, error: ${err.message}`,
    );

    throw err;
  }
};

const createMultiPartFile = async (
  txId: string,
  createMultiPartFile: MultipartFileCreateInS3Type,
): Promise<{ uploadId: string; fileName: string; err?: string; signedUrls: string[] }> => {
  const { fileType, fileName, noOfParts } = createMultiPartFile;

  logInfo(
    `[${txId}] [createMultiPartFile] Initiating multipart upload - File: ${fileName}, Type: ${fileType}, Parts: ${noOfParts}`,
  );

  const key = `${fileName}.${fileType}`;

  logDebug(`[${txId}] [createMultiPartFile] Generated S3 Key: ${key}`);

  const s3MultiPartCreateInput: CreateMultipartUploadCommandInput = {
    Bucket: s3Config.bucketName,
    Key: key,
  };

  try {
    const response: CreateMultipartUploadCommandOutput = await s3ClientLocal.send(
      new CreateMultipartUploadCommand(s3MultiPartCreateInput),
    );

    logInfo(`[${txId}] [createMultiPartFile] Multipart upload initiated successfully - UploadId: ${response.UploadId}`);
    const signedUrlPromises = [];

    for (let index = 0; index < createMultiPartFile.noOfParts; index++) {
      const s3UploadInput: UploadPartCommandInput = {
        Bucket: s3Config.bucketName,
        Key: key,
        PartNumber: index + 1,
        UploadId: response.UploadId,
      };
      signedUrlPromises.push(
        getSignedUrl(s3ClientLocal, new UploadPartCommand(s3UploadInput), { expiresIn: expirationTimeForUpload }),
      );
    }
    const signedUrls = await Promise.all(signedUrlPromises);
    logInfo(`[${txId}] [createMultiPartFile] Signed URLs generated successfully - Total Parts: ${signedUrls.length}`);

    return { uploadId: response.UploadId, fileName: response.Key, signedUrls };
  } catch (err) {
    logError(`[${txId}] s3_service [Method] [createMultiPartFile] S3 upload failed ${err.message}`);
    throw err;
  }
};

const initiateMultipartUpload = async (
  txId: string,
  fileName: string,
  partsCount: number,
): Promise<{ uploadId: string; fileIdentifier: string; signedUrls: string[] }> => {
  logInfo(
    `[${txId}] [initiateMultipartUpload] Initiating multipart upload - file identifier: ${fileName}, Parts: ${partsCount}`,
  );

  try {
    const { UploadId: uploadId, Key: fileIdentifier } = await s3ClientLocal.send(
      new CreateMultipartUploadCommand({
        Bucket: s3Config.bucketName,
        Key: fileName,
      }),
    );

    logInfo(`[${txId}] [initiateMultipartUpload] Multipart upload initiated successfully - UploadId: ${uploadId}`);

    const signedUrlPromises = [];

    // Part number should be a positive integer starting from 1
    for (let partNumber = 1; partNumber <= partsCount; partNumber += 1) {
      signedUrlPromises.push(
        getSignedUrl(
          s3ClientLocal,
          new UploadPartCommand({
            Bucket: s3Config.bucketName,
            Key: fileIdentifier,
            PartNumber: partNumber,
            UploadId: uploadId,
          }),
          { expiresIn: expirationTimeForUpload },
        ),
      );
    }

    const signedUrls = await Promise.all(signedUrlPromises);

    logInfo(
      `[${txId}] [initiateMultipartUpload] Signed URLs generated successfully for File identifier: ${fileIdentifier} with parts count: ${signedUrls.length}`,
    );

    return { uploadId, fileIdentifier, signedUrls };
  } catch (err) {
    logError(`[${txId}] s3_service [VENDOR] [initiateMultipartUpload] S3 upload failed ${err.message}`);

    throw err;
  }
};

const completeMultipartUpload = async (
  txId: string,
  uploadId: string,
  fileIdentifier: string,
  uploadedParts: { etag: string; partNumber: number }[],
): Promise<string> => {
  let presignedUrl = '';

  logInfo(
    `[${txId}] [completeMultipartUpload] Multipart upload complete phase initiated with File identifier: ${fileIdentifier}`,
  );

  const s3CompleteInput: CompleteMultipartUploadCommandInput = {
    Bucket: s3Config.bucketName,
    Key: fileIdentifier,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: uploadedParts.map(({ etag, partNumber }) => ({
        ETag: etag,
        PartNumber: partNumber,
      })),
    },
  };

  try {
    await s3ClientLocal.send(new CompleteMultipartUploadCommand(s3CompleteInput));

    logInfo(`[${txId}] s3_service [VENDOR] [completeMultipartUpload] Multipart upload completed successfully.`);

    presignedUrl = await getSignedUrl(
      s3ClientLocal,
      new GetObjectCommand({
        Bucket: s3Config.bucketName,
        Key: fileIdentifier,
      }),
      {
        expiresIn: expirationTime,
      },
    );

    logInfo(
      `[${txId}] s3_service [VENDOR] [completeMultipartUpload] File uploaded successfully signedUrl: ${presignedUrl}, fileName: ${s3CompleteInput.Key}`,
    );

    return presignedUrl;
  } catch (err) {
    logError(`[${txId}] s3_service [VENDOR] [completeMultipartUpload] S3 upload failed ${err.message}`);

    throw err;
  }
};

const completeMultiPartFileUpload = async (
  txId: string,
  completeMultiPartFile: MultipartFileCompleteInS3Type,
): Promise<{
  isUploaded: boolean;
  presignedUrl: string;
  fileName: string;
  submittedForCompression?: boolean;
  err?: string;
}> => {
  const { fileName, uploadId, fileType, uploadedParts } = completeMultiPartFile;
  let isUploaded = false;
  let presignedUrl = '';
  logInfo(
    `[${txId}] s3_service [Method] [completeMultiPartFileUpload] Service initiated for filename: ${JSON.stringify(
      fileName,
    )} and fileType: ${fileType}`,
  );

  const key = `${fileName}.${fileType}`;

  logInfo(`[${txId}] [completeMultiPartFileUpload] Generated S3 Key: ${key}`);

  const s3CompleteInput: CompleteMultipartUploadCommandInput = {
    Bucket: s3Config.bucketName,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: uploadedParts.map(({ etag, partNumber }) => ({
        ETag: etag,
        PartNumber: partNumber,
      })),
    },
  };

  const s3GetInput: GetObjectCommandInput = {
    Bucket: s3Config.bucketName,
    Key: key,
  };

  try {
    const response: CompleteMultipartUploadCommandOutput = await s3ClientLocal.send(
      new CompleteMultipartUploadCommand(s3CompleteInput),
    );

    logInfo(`[${txId}] [completeMultiPartFileUpload] Multipart upload completed successfully.`);

    if (response) {
      logInfo(`[${txId}] [completeMultiPartFileUpload] Response: ${JSON.stringify(response)}`);

      presignedUrl = await getSignedUrl(s3ClientLocal, new GetObjectCommand(s3GetInput), {
        expiresIn: expirationTime,
      });
      isUploaded = true;

      logInfo(
        `[${txId}] s3_service [Method] [completeMultiPartFileUpload] File uploaded successfully signedUrl: ${presignedUrl}, fileName: ${s3CompleteInput.Key}`,
      );
    }

    return { isUploaded, presignedUrl, fileName: s3CompleteInput.Key };
  } catch (err) {
    logError(`[${txId}] s3_service [Method] [completeMultiPartFileUpload] S3 upload failed ${err.message}`);

    throw err;
  }
};

const abortMultipartFile = async (
  txId: string,
  fileName: string,
  uploadId: string,
  bucketName: string,
): Promise<void> => {
  try {
    const s3Input: AbortMultipartUploadCommandInput = {
      Bucket: bucketName,
      Key: fileName,
      UploadId: uploadId,
    };
    const response = await s3ClientLocal.send(new AbortMultipartUploadCommand(s3Input));
    if (response) {
      logInfo(`[${txId}] s3_service [Method] [abortFile] File aborted successfully`);
    }
  } catch (err) {
    logError(`${txId} [SERVICE] [s3_service] [Method] [abortFile]  Error info: ${err.message}`);
  }
};

export {
  getReadableStreamFromS3Object,
  createPresignedUrlWithClient,
  uploadFileToS3,
  UploadFileS3Type,
  deleteFileFromS3,
  createMultiPartFile, // Re-assess/deprecate
  completeMultiPartFileUpload, // Re-assess/deprecate
  initiateMultipartUpload,
  completeMultipartUpload,
  abortMultipartFile,
};
