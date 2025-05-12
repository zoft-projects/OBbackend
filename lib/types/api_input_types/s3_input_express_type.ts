import { MultiMediaEnum } from '../../enums';

type MultipartFileCompleteInS3Type = {
  id: string;
  fileName: string;
  fileType: string;
  type: MultiMediaEnum;
  uploadId: string;
  uploadedParts: { partNumber: number; etag: string }[];
};

type MultipartFileCreateInS3Type = {
  id: string;
  fileName: string;
  fileType: string;
  type: MultiMediaEnum;
  noOfParts: number;
};

export { MultipartFileCompleteInS3Type, MultipartFileCreateInS3Type };
