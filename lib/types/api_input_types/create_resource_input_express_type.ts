import { FileTransportEnum, MultiMediaEnum } from '../../enums';

type HttpPOSTCreateOBResource = {
  resourceName: string;
  audienceLevel: string;
  branchIds?: string[];
  provincialCodes?: string[];
  divisionIds?: string[];
  fileType: FileTransportEnum;
  mediaType: MultiMediaEnum;
  imageUrl?: string;
  docUrl?: string;
  // TODO: Remove after migration
  createdByUserId?: string;
  createdByUserName?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
};

export { HttpPOSTCreateOBResource };
