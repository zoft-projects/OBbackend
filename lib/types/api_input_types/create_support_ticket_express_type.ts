import {
  FileTransportEnum,
  PriorityEnum,
  TicketEnum,
  BugStatusEnum,
  RequestModeEnum,
  MultiMediaEnum,
} from '../../enums';
type HttpPOSTSupportTicketMultiMedia = {
  fileType: FileTransportEnum;
  mediaType: MultiMediaEnum;
  imageUrl?: string;
  videoUrl?: string;
};

type HttpPOSTUpsertSupportTicket = {
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
  initiatedUserPsId?: string; // TODO : Remove after migration
  initiatedUserEmail?: string; // TODO : Remove after migration
  initiatedUserName?: string; // TODO : Remove after migration
  stepsToReproduce?: string;
  multiMedias?: HttpPOSTSupportTicketMultiMedia[];
  resolutionNote?: {
    resolvedBy: string;
    date: Date;
    note: string;
  };
  // TODO remove after migration
  updatedAt?: string;
  createdAt?: string;
};

export { HttpPOSTUpsertSupportTicket };
