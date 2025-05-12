import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import axios from 'axios';
import config from 'config';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import {
  FileTransportEnum,
  MediaOrientationEnum,
  MultiMediaEnum,
  ReadFileTypeEnum,
  S3FoldersEnum,
  MultipartUploadPhaseEnum,
} from '../../enums';
import { logError, logInfo } from '../../log/util';
import {
  MultiMediaBufferType,
  MultiMediaInputType,
  MultipartFileCompleteInS3Type,
  MultipartFileAbortToS3Type,
  MultipartFileCreateInS3Type,
} from '../../types';
import { createNanoId } from '../../utils';
import {
  createPresignedUrlWithClient,
  getReadableStreamFromS3Object,
  uploadFileToS3,
  deleteFileFromS3,
  completeMultiPartFileUpload,
  initiateMultipartUpload,
  completeMultipartUpload,
  createMultiPartFile,
  abortMultipartFile,
} from '../../vendors';

const tempDirectory: string = config.get('tmpDirectory');
const s3Config: { bucketName: string; signedUrlExpiryTime: number; compressionEnabled: boolean } =
  config.get('Services.s3');

const createFolderIfNotExists = () => {
  const folderName = tempDirectory;
  if (!fs.existsSync(folderName)) {
    fs.mkdirSync(folderName);
  }

  return folderName;
};

createFolderIfNotExists();

const generateUniqueFilename = (originalFilename: string, multimediaType: MultiMediaEnum): string => {
  const nanoId = createNanoId(5);
  const uniqueFilename = `${multimediaType}_${nanoId}_${originalFilename}`;

  return uniqueFilename;
};

const compressImage = async (txId: string, inputBuffer: Buffer): Promise<Buffer> => {
  try {
    logInfo(
      `[${txId}] [ONEBAYSHORE-MULTIMEDIA-SERVICE] Started compressing of image file
      )}`,
    );
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    let compressedBuffer: Buffer;
    if (metadata.format === 'png') {
      compressedBuffer = await image.png({ compressionLevel: 6 }).toBuffer();
    } else if (metadata.format === 'jpeg') {
      compressedBuffer = await image.jpeg({ quality: 80 }).toBuffer();
    } else {
      compressedBuffer = await image.webp({ lossless: true }).toBuffer();
    }

    return compressedBuffer;
  } catch (err) {
    logError(
      `[${txId}] [ONEBAYSHORE-MULTIMEDIA-SERVICE] Error occurred during image file compression
      )}`,
    );
    throw err;
  }
};

type ImageProperties = {
  width: number;
  height: number;
  format: string;
  size: number;
  orientation: string;
};

const findOrientationOfImage = (metadata: { width: number; height: number }): MediaOrientationEnum => {
  if (metadata.width > metadata.height) {
    return MediaOrientationEnum.Landscape;
  }
  if (metadata.width < metadata.height) {
    return MediaOrientationEnum.Portrait;
  }

  return MediaOrientationEnum.Square;
};

const getImagePropertiesFromBuffer = async (buffer: Buffer): Promise<ImageProperties> => {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const size = buffer.length;

  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    size,
    orientation: findOrientationOfImage({ width: metadata.width, height: metadata.height }),
  };
};

// not used now may be later these functions can be used
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const compressVideo = async (txId: string, inputBuffer: Readable, outputPath: string): Promise<void> => {
  logInfo(
    `[${txId}] [ONEBAYSHORE-MULTIMEDIA-SERVICE] Started compressing of video file
    )}`,
  );

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg()
      .input(inputBuffer)
      .videoCodec('libx264')
      .videoBitrate(800)
      .audioCodec('aac')
      .audioBitrate(128)
      .format('mp4')
      .save(outputPath);

    command.on('error', (err) => {
      logError(
        `[${txId}] [ONEBAYSHORE-MULTIMEDIA-SERVICE] Error occurred during video file compression
        )}`,
      );

      reject(err);
    });

    command.on('end', () => {
      resolve();
    });
  });
};

// not used now may be later these functions can be used
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const compressAudio = (txId: string, inputBuffer: Readable, outputPath: string) => {
  try {
    logInfo(
      `[${txId}] [ONEBAYSHORE-MULTIMEDIA-SERVICE] Started compressing of audio file
      )}`,
    );

    const command = ffmpeg().input(inputBuffer).audioCodec('aac').audioBitrate(128).format('mp3');

    command.save(outputPath);
  } catch (err) {
    logError(
      `[${txId}] [ONEBAYSHORE-MULTIMEDIA-SERVICE] Error occurred during audio file compression
      )}`,
    );

    throw err;
  }
};

// use it for later in video / audio compression
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const removeFile = async (filePath): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  });
};

const extractFilePropertiesFromUrl = async (
  txId: string,
  url: string,
  contentType: string,
): Promise<{
  buffer: Buffer;
  properties: { fieldName: string; originalName: string; encoding: string; mimetype: string; size: number };
}> => {
  try {
    let buffer = null;
    let extension = '';

    const response = await axios.get(url, { responseType: 'arraybuffer' });
    buffer = response.data;
    extension = path.extname(url);
    const extensionType = extension.substring(1);
    const fileName = path.basename(url);
    const sizeInBytes = buffer.byteLength;

    const prop = {
      fieldName: '',
      originalName: fileName,
      encoding: '7bit',
      mimetype: `${contentType}${extensionType}`,
      size: sizeInBytes,
    };

    return { buffer, properties: prop };
  } catch (error) {
    logError(
      `[${txId}] [ONEBAYSHORE-MULTIMEDIA-SERVICE] Error occurred while extracting properties of file, error: ${error.message}`,
    );

    throw error;
  }
};

type UploadedFile = {
  fieldName: string;
  originalName: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const storeFileS3 = async (
  txId: string,
  fileData: UploadedFile,
  multimediaType: MultiMediaEnum,
  folderName: S3FoldersEnum,
  presetFileName?: string,
): Promise<{ fileName: string; versionId?: string }> => {
  try {
    logInfo(`[${txId}] [ONEBAYSHORE-MULTIMEDIA-SERVICE] Received input values for uploading file to S3`);

    const file: UploadedFile = fileData;
    // TODO: look at how to get filename to delete from mongo entry
    // use for video and audio compression for large file data storing in temp folder
    let fileName = '';

    let fileContent: Buffer = null;

    switch (multimediaType) {
      case MultiMediaEnum.Image:
        {
          fileName = generateUniqueFilename(file.originalName, MultiMediaEnum.Image);
          fileContent = file.buffer;

          if (s3Config.compressionEnabled) {
            // Replace compressed image
            fileContent = await compressImage(txId, file.buffer);
          }
        }
        break;
      case MultiMediaEnum.Video:
        {
          fileName = generateUniqueFilename(file.originalName, MultiMediaEnum.Video);
          fileContent = fileData.buffer;
        }
        break;
      case MultiMediaEnum.Audio:
        {
          fileName = generateUniqueFilename(file.originalName, MultiMediaEnum.Audio);
          fileContent = fileData.buffer;
        }
        break;
      case MultiMediaEnum.Document:
        {
          fileName = generateUniqueFilename(file.originalName, MultiMediaEnum.Document);
          fileContent = fileData.buffer;
        }
        break;
      default: {
        throw new Error('Invalid file type');
      }
    }

    fileName = presetFileName ?? fileName;

    const { versionId } = await uploadFileToS3(txId, {
      content: fileContent,
      fileName: `${folderName}${fileName}`,
      contentType: file.encoding,
    });

    return {
      fileName: `${folderName}${fileName}`,
      versionId,
    };
  } catch (err) {
    logError(
      `[${txId}] [ONEBAYSHORE-MULTIMEDIA-SERVICE] Error occurred while uploading a file to s3, error: ${err.message}`,
    );

    throw err;
  }
};

const deleteFileS3 = async (txId: string, fileName: string): Promise<string> => {
  try {
    logInfo(`[${txId}] [ONEBAYSHORE-MULTIMEDIA-SERVICE] Received input values for deleting file from S3`);

    await deleteFileFromS3(txId, fileName);

    return fileName;
  } catch (err) {
    logError(
      `[${txId}] [ONEBAYSHORE-MULTIMEDIA-SERVICE] Error occurred while uploading a file to s3, error: ${err.message}`,
    );

    throw err;
  }
};

type ReadFileFromS3ParamsType = {
  key: string;
  readType: ReadFileTypeEnum;
};

const readFileFromS3 = async (txId: string, readFileData: ReadFileFromS3ParamsType): Promise<string | Readable> => {
  switch (readFileData.readType) {
    case ReadFileTypeEnum.PresignedUrl: {
      const presignedUrl = await createPresignedUrlWithClient(txId, readFileData.key);

      return presignedUrl;
    }
    case ReadFileTypeEnum.ReadableObject: {
      const readableFileData = await getReadableStreamFromS3Object(txId, readFileData.key);

      return readableFileData;
    }
    default: {
      throw new Error('Invalid read file type');
    }
  }
};

const makeSignedUrl = async (transactionId: string, fileUrl: string): Promise<string> => {
  try {
    return await createPresignedUrlWithClient(transactionId, fileUrl);
  } catch (urlMakeErr) {
    logError(
      `[${transactionId}] [SERVICE] [makeSignedUrl] Error occurred while creating signedUrl, error: ${urlMakeErr.message}`,
    );

    // Silent fail
    return '';
  }
};

type responseFromUrlToBuffer = {
  buffer: Buffer;
  properties: { fieldName: string; originalName: string; encoding: string; mimetype: string; size: number };
};

const storeIntoS3FromUrl = async (
  txId: string,
  url: string,
  bucketName: string,
  multiMediaType: MultiMediaEnum.Image | MultiMediaEnum.Video | MultiMediaEnum.Audio | MultiMediaEnum.Document,
  folderName: S3FoldersEnum,
): Promise<{ fileName: string; width?: number; height?: number; orientation?: string }> => {
  try {
    let contentType = '';
    switch (multiMediaType) {
      case MultiMediaEnum.Image:
        contentType = 'image/';
        break;
      case MultiMediaEnum.Video:
        contentType = 'video/';
        break;
      case MultiMediaEnum.Audio:
        contentType = 'audio/';
        break;
      case MultiMediaEnum.Document:
        contentType = 'document/';
        break;
      default:
        contentType = '';
        break;
    }
    const getBuffer: responseFromUrlToBuffer = await extractFilePropertiesFromUrl(txId, url, contentType);

    const inputParams = {
      fieldName: '',
      originalName: getBuffer.properties.originalName,
      encoding: getBuffer.properties.encoding,
      mimetype: getBuffer.properties.mimetype,
      size: getBuffer.properties.size,
      buffer: getBuffer.buffer,
    };

    const result = await storeFileS3(txId, inputParams, multiMediaType, folderName);

    let returnObj: { fileName: string; width?: number; height?: number; orientation?: string } = {
      fileName: result.fileName,
    };
    if (multiMediaType === MultiMediaEnum.Image) {
      const imageProperties = await getImagePropertiesFromBuffer(getBuffer.buffer);
      returnObj = {
        ...returnObj,
        width: imageProperties.width,
        height: imageProperties.height,
        orientation: imageProperties.orientation,
      };
    }

    return returnObj;
  } catch (err) {
    logError(`[${txId}] [SERVICE] storeIntoS3FromUrl - ERROR storing file in s3 Error : ${err.message}`);

    throw err;
  }
};

const storeIntoS3FromBuffer = async (
  txId: string,
  buffer: MultiMediaBufferType,
  bucketName: string,
  multiMediaType: MultiMediaEnum,
  folderName: S3FoldersEnum,
  presetFileName?: string,
): Promise<{ fileName: string; versionId?: string }> => {
  try {
    const inputParams = {
      fieldName: buffer.fieldName,
      originalName: buffer.originalName,
      encoding: buffer.encoding,
      mimetype: buffer.mimetype,
      size: buffer.size,
      buffer: buffer.buffer,
    };

    return storeFileS3(txId, inputParams, multiMediaType, folderName, presetFileName);
  } catch (err) {
    logError(`[${txId}] [SERVICE] storeIntoS3FromBuffer - ERROR storing file in s3 Error : ${err.message}`);

    throw err;
  }
};

const storeMultiMedia = async (
  txId: string,
  multiMediaInput: MultiMediaInputType,
  folderName: S3FoldersEnum,
  presetFileName?: string,
): Promise<MultiMediaInputType & { storedFileName?: string; versionId?: string }> => {
  let versionId: string;
  let storedFileName: string;
  switch (multiMediaInput.type) {
    case FileTransportEnum.Buffer: {
      if (multiMediaInput?.image?.buffer?.buffer) {
        const data = await storeIntoS3FromBuffer(
          txId,
          multiMediaInput.image.buffer,
          multiMediaInput?.image?.bucketName,
          MultiMediaEnum.Image,
          folderName,
          presetFileName,
        );

        versionId = data.versionId;
        storedFileName = data.fileName;

        const imageProperties = await getImagePropertiesFromBuffer(multiMediaInput.image.buffer.buffer);

        multiMediaInput.image.url = data.fileName;
        multiMediaInput.image.width = imageProperties.width;
        multiMediaInput.image.height = imageProperties.height;
        multiMediaInput.image.orientation = imageProperties.orientation;
      }

      if (multiMediaInput?.video?.buffer?.buffer) {
        const data = await storeIntoS3FromBuffer(
          txId,
          multiMediaInput.video.buffer,
          multiMediaInput?.video?.bucketName,
          MultiMediaEnum.Video,
          folderName,
        );

        multiMediaInput.video.url = data.fileName;
      }

      if (multiMediaInput?.audio?.buffer?.buffer) {
        const data = await storeIntoS3FromBuffer(
          txId,
          multiMediaInput.audio.buffer,
          multiMediaInput?.audio?.bucketName,
          MultiMediaEnum.Audio,
          folderName,
        );

        multiMediaInput.audio.url = data.fileName;
      }

      if (multiMediaInput?.document?.buffer?.buffer) {
        const data = await storeIntoS3FromBuffer(
          txId,
          multiMediaInput.document.buffer,
          multiMediaInput?.document?.bucketName,
          MultiMediaEnum.Document,
          folderName,
        );

        multiMediaInput.document.url = data.fileName;
      }

      return { ...multiMediaInput, storedFileName, versionId };
    }
    case FileTransportEnum.Link: {
      if (multiMediaInput?.image?.url) {
        const data = await storeIntoS3FromUrl(
          txId,
          multiMediaInput.image.url,
          multiMediaInput.image?.bucketName,
          MultiMediaEnum.Image,
          folderName,
        );

        multiMediaInput.image.url = data.fileName;
        multiMediaInput.image.width = data.width;
        multiMediaInput.image.height = data.height;
        multiMediaInput.image.orientation = data.orientation;
      }

      if (multiMediaInput?.video?.url) {
        const data = await storeIntoS3FromUrl(
          txId,
          multiMediaInput.video.url,
          multiMediaInput.video?.bucketName,
          MultiMediaEnum.Video,
          folderName,
        );

        multiMediaInput.video.url = data.fileName;
      }

      if (multiMediaInput?.audio?.url) {
        const data = await storeIntoS3FromUrl(
          txId,
          multiMediaInput.audio.url,
          multiMediaInput.audio?.bucketName,
          MultiMediaEnum.Audio,
          folderName,
        );

        multiMediaInput.audio.url = data.fileName;
      }

      if (multiMediaInput?.document?.url) {
        const data = await storeIntoS3FromUrl(
          txId,
          multiMediaInput.document.url,
          multiMediaInput.document?.bucketName,
          MultiMediaEnum.Document,
          folderName,
        );

        multiMediaInput.document.url = data.fileName;
      }

      return { ...multiMediaInput, storedFileName, versionId };
    }
    default: {
      throw new Error('Invalid media type');
    }
  }
};

const UploadMultiPartToS3 = async (
  transactionId: string,
  uploadFile: MultipartFileCreateInS3Type | MultipartFileCompleteInS3Type | MultipartFileAbortToS3Type,
  phase: string,
): Promise<{
  fileName: string;
  uploadId?: string;
  signedUrls?: string[];
  url?: string;
  submittedForCompression?: boolean;
}> => {
  logInfo(`[${transactionId}] Processing multipart upload - Phase: ${phase}`);

  switch (phase) {
    case MultipartUploadPhaseEnum.create:
      return await handleCreateMultipart(transactionId, uploadFile as MultipartFileCreateInS3Type);

    case MultipartUploadPhaseEnum.complete:
      return await handleCompleteMultipart(transactionId, uploadFile as MultipartFileCompleteInS3Type);

    case MultipartUploadPhaseEnum.abort:
      return await handleAbortMultipart(transactionId, uploadFile as MultipartFileAbortToS3Type);

    default:
      throw new Error(`Invalid multipart upload phase: ${phase}`);
  }
};

// **Helper Functions for Better Code Structure**
const handleCreateMultipart = async (transactionId: string, uploadFile: MultipartFileCreateInS3Type) => {
  logInfo(`[${transactionId}] Creating multipart file upload - Details: ${JSON.stringify(uploadFile)}`);

  const createdFile = await createMultiPartFile(transactionId, {
    ...uploadFile,
    fileName: `${uploadFile.id}`,
  });

  logInfo(`[${transactionId}] Multipart file created successfully - File Details: ${JSON.stringify(createdFile)}`);

  return {
    fileName: createdFile.fileName,
    uploadId: createdFile.uploadId,
    signedUrls: createdFile.signedUrls,
  };
};

const handleCompleteMultipart = async (transactionId: string, uploadFile: MultipartFileCompleteInS3Type) => {
  logInfo(`[${transactionId}] Completing multipart file upload - Details: ${JSON.stringify(uploadFile)}`);

  const completedMultiPartUpload = await completeMultiPartFileUpload(transactionId, {
    ...uploadFile,
    fileName: `${uploadFile.id}`,
  });

  logInfo(
    `[${transactionId}] Multipart file upload completed - File Details: ${JSON.stringify(completedMultiPartUpload)}`,
  );

  return {
    fileName: uploadFile.fileName,
    url: completedMultiPartUpload.presignedUrl,
    submittedForCompression: completedMultiPartUpload.submittedForCompression,
  };
};

const handleAbortMultipart = async (transactionId: string, uploadFile: MultipartFileAbortToS3Type) => {
  logInfo(`[${transactionId}] Aborting multipart upload - File: ${JSON.stringify(uploadFile)}`);
  await abortMultipartFile(transactionId, uploadFile.fileName, uploadFile.uploadId, s3Config.bucketName);

  logInfo(`[${transactionId}] Multipart upload aborted successfully - File Name: ${uploadFile.fileName}`);

  return { fileName: uploadFile.fileName };
};

const getFeatureName = (featureName: string): string => {
  switch (featureName) {
    case 'chat':
      return 'chat_attachments';
    case 'resources':
      return 'resources';
    default:
      return 'resources';
  }
};

const attachSmallAttachmentForMultimedia = async (
  transactionId: string,
  file: Express.Multer.File,
  fileName: string,
  featureName: string,
): Promise<{
  fileIdentifier: string;
  signedUrl: string;
}> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [MULTIMEDIA] attachSmallAttachmentForMultimedia - Processing file: ${fileName}`,
    );

    const folderName = getFeatureName(featureName);
    const fileIdentifier = `${folderName}/${fileName}`;

    await uploadFileToS3(transactionId, {
      content: file.buffer,
      fileName: fileIdentifier,
    });

    const presignedUrl = await createPresignedUrlWithClient(transactionId, fileIdentifier);

    return {
      fileIdentifier,
      signedUrl: presignedUrl,
    };
  } catch (attachErr) {
    logError(
      `[${transactionId}] [SERVICE] [MULTIMEDIA] attachSmallAttachmentForMultimedia - FAILED. Error: ${attachErr.message}`,
    );

    throw attachErr;
  }
};

const initiateLargeAttachmentForMultimedia = async (
  transactionId: string,
  fileName: string,
  partsCount: number,
  featureName: string,
): Promise<{
  fileIdentifier: string;
  signedUrls: string[];
  uploadId: string;
}> => {
  logInfo(
    `[${transactionId}] [SERVICE] [MULTIMEDIA] [initiateLargeAttachmentForMultimedia] Processing file: ${fileName}`,
  );
  const folderName = getFeatureName(featureName);

  const { fileIdentifier, signedUrls, uploadId } = await initiateMultipartUpload(
    transactionId,
    `${folderName}/${fileName}`,
    partsCount,
  );

  logInfo(
    `[${transactionId}] [SERVICE] [MULTIMEDIA] [initiateLargeAttachmentForMultimedia] Init Successful for file: ${fileIdentifier}, uploadId: ${uploadId}`,
  );

  return {
    fileIdentifier,
    signedUrls,
    uploadId,
  };
};

const finalizeLargeAttachmentForMultimedia = async (
  transactionId: string,
  fileIdentifier: string,
  {
    uploadId,
    uploadedParts,
  }: {
    uploadId: string;
    uploadedParts: { etag: string; partNumber: number }[];
  },
): Promise<string> => {
  logInfo(
    `[${transactionId}] [SERVICE] [MULTIMEDIA] [finalizeLargeAttachmentForMultimedia] Processing file: ${fileIdentifier}`,
  );

  const attachedUrl = await completeMultipartUpload(transactionId, uploadId, fileIdentifier, uploadedParts);

  logInfo(
    `[${transactionId}] [SERVICE] [MULTIMEDIA] [finalizeLargeAttachmentForMultimedia] Processing file: ${fileIdentifier}`,
  );

  return attachedUrl;
};

export {
  storeFileS3,
  readFileFromS3,
  getFeatureName,
  extractFilePropertiesFromUrl,
  getImagePropertiesFromBuffer,
  findOrientationOfImage,
  storeMultiMedia,
  storeIntoS3FromBuffer,
  deleteFileS3,
  makeSignedUrl,
  UploadMultiPartToS3,
  attachSmallAttachmentForMultimedia,
  initiateLargeAttachmentForMultimedia,
  finalizeLargeAttachmentForMultimedia,
};
