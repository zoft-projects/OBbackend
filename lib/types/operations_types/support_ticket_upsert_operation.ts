import { FileTransportEnum, PriorityEnum, TicketEnum, BugStatusEnum, RequestModeEnum } from '../../enums';

type FileBufferDataType = {
  fieldName?: string;
  originalName?: string;
  encoding?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

type SupportTicketMultiMediaType = {
  type?: FileTransportEnum.Link | FileTransportEnum.Buffer;
  image?: {
    url?: string;
    buffer?: FileBufferDataType;
    bucketName?: string;
    orientation?: string;
    height?: number;
    width?: number;
  };
  video?: {
    url?: string;
    buffer?: FileBufferDataType;
    bucketName?: string;
    sourceType?: string;
  };
  document?: {
    url?: string;
    buffer?: FileBufferDataType;
    bucketName?: string;
  };
};

type SupportTicketUpsertOperationType = {
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
  initiatedUser?: {
    employeePsId: string;
    employeeEmail?: string;
    displayName?: string;
  };
  stepsToReproduce?: string;
  multiMedias?: SupportTicketMultiMediaType[];
  resolutionNote?: {
    resolvedBy: string;
    date: Date;
    note: string;
  };
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
};

export { FileBufferDataType, SupportTicketMultiMediaType, SupportTicketUpsertOperationType };
