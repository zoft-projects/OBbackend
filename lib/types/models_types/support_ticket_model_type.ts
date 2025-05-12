import { TicketEnum, PriorityEnum, BugStatusEnum, MultiMediaEnum, RequestModeEnum } from '../../enums';

type OBSupportTicketUserSchemaType = {
  employeePsId: string;
  employeeEmail?: string;
  displayName?: string;
};

type OBSupportTicketImageSchemaType = {
  url: string;
  bucketName?: string;
  orientation?: string;
  width?: number;
  height?: number;
};

type OBSupportTicketVideoSchemaType = {
  url: string;
  bucketName?: string;
  sourceType?: string;
};

type OBSupportTicketMultiMediaSchemaType = {
  image?: OBSupportTicketImageSchemaType;
  video?: OBSupportTicketVideoSchemaType;
  mediaType: MultiMediaEnum;
};

type OBResolutionNotesSchemaType = {
  resolvedBy: string;
  date: Date;
  note: string;
};

type OBSupportTicketSchemaType = {
  id?: string;
  ticketRefId: string;
  title: string;
  summary?: string;
  ticketType: TicketEnum;
  priority: PriorityEnum;
  tags?: string[];
  categories?: string[];
  assignedPsIds?: string[];
  assignedBranchIds?: string[];
  ticketStatus: BugStatusEnum;
  initiatorType: RequestModeEnum;
  initiatedUser?: OBSupportTicketUserSchemaType;
  stepsToReproduce?: string;
  multiMedias?: OBSupportTicketMultiMediaSchemaType[];
  resolutionNote?: OBResolutionNotesSchemaType;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
};

export {
  OBSupportTicketSchemaType,
  OBResolutionNotesSchemaType,
  OBSupportTicketMultiMediaSchemaType,
  OBSupportTicketImageSchemaType,
  OBSupportTicketVideoSchemaType,
  OBSupportTicketUserSchemaType,
};
