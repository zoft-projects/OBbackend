import { BugStatusEnum, PriorityEnum, TicketEnum } from '../../enums';

type SupportTicketPayloadType = {
  ticketRefId: string;
  title: string;
  summary?: string;
  type: TicketEnum;
  priority: PriorityEnum;
  tags?: string[];
  status: BugStatusEnum;
  attachments?: {
    imageUrl: string;
  }[];
  initiatedUser: {
    employeePsId: string;
    employeeEmail?: string;
    displayName?: string;
  };
  createdDate?: Date;
};

export { SupportTicketPayloadType };
