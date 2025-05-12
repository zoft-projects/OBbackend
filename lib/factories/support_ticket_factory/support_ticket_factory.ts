import { TicketEnum, PriorityEnum, BugStatusEnum, RequestModeEnum } from '../../enums';
import { SupportTicketUpsertOperationType } from '../../types';
import { createNanoId } from '../../utils';

/**
 * Factory Name: support_ticket_factory
 * Description: This factory is to provide sample data for support tickets
 */

const generateSupportTicketUpsertOperationEntry = (
  overrideProps: Partial<SupportTicketUpsertOperationType> = {},
): SupportTicketUpsertOperationType => {
  const sampleTicketData: SupportTicketUpsertOperationType = {
    ticketRefId: `${createNanoId(5, 'AlphaNumeric')}`,
    title: 'Virtual Ticket',
    ticketType: TicketEnum.Task,
    priority: PriorityEnum.Low,
    ticketStatus: BugStatusEnum.Open,
    initiatorType: RequestModeEnum.User,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { ...sampleTicketData, ...overrideProps };
};

export { generateSupportTicketUpsertOperationEntry };
