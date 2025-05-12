import { FileTransportEnum } from '../../enums';

type MultiMediaBufferType = {
  fieldName?: string;
  originalName?: string;
  encoding?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

type MultiMediaInputType = {
  type?: FileTransportEnum.Link | FileTransportEnum.Buffer;
  image?: {
    url?: string;
    buffer?: MultiMediaBufferType;
    bucketName?: string;
    orientation?: string;
    height?: number;
    width?: number;
  };
  audio?: {
    url?: string;
    buffer?: MultiMediaBufferType;
    bucketName?: string;
  };
  video?: {
    url?: string;
    buffer?: MultiMediaBufferType;
    bucketName?: string;
    sourceType?: string;
  };
  document?: {
    url?: string;
    buffer?: MultiMediaBufferType;
    bucketName?: string;
  };
};

export { MultiMediaInputType, MultiMediaBufferType };
