import { BugStatusEnum } from '../../enums';

type OBBugUserSchemaType = {
  employeePsId: string;
  displayName: string;
  userImageLink?: string;
};

type OBBugImageSchemaType = {
  url: string;
  bucketName: string;
  orientation: string;
  width?: number;
  height?: number;
};

type OBBugSchemaType = {
  id?: string;
  bugId: string;
  title: string;
  description: string;
  status: BugStatusEnum;
  attachment: OBBugImageSchemaType;
  createdBy: OBBugUserSchemaType;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export { OBBugSchemaType };
