import config from 'config';
import { FilterQuery, QueryOptions } from 'mongoose';
import { multiMediaService } from '..';
import { S3FoldersEnum, MultiMediaEnum, ReadFileTypeEnum } from '../../enums';
import { logInfo, logWarn, logError, logDebug } from '../../log/util';
import { OBSupportTicketModel } from '../../models';
import { userService, locationService, emailService } from '../../services';
import { OBSupportTicketSchemaType, SupportTicketUpsertOperationType } from '../../types';
import { createNanoId, mapSupportTicketServiceRequestToDBRecord } from '../../utils';

const getTicketByRefId = async (
  transactionId: string,
  ticketRefId: string,
): Promise<OBSupportTicketSchemaType | null> => {
  logInfo(`[${transactionId}] [SERVICE] getTicketByRefId - Getting ticket by ticketRefId: ${ticketRefId}`);

  try {
    const ticketDbRecord = await OBSupportTicketModel.findOne({ ticketRefId });

    if (ticketDbRecord) {
      const ticket = ticketDbRecord.toJSON();

      return ticket;
    }

    logWarn(`[${transactionId}] [SERVICE] getTicketByRefId - No ticket found for ticketRefId: ${ticketRefId}`);

    return null;
  } catch (getErr) {
    logError(
      `[${transactionId}] [SERVICE] getTicketByRefId - FAILED for ticketRefId: ${ticketRefId}, reason: ${getErr.message}`,
    );

    throw getErr;
  }
};

const getTicketsByFilter = async (
  transactionId: string,
  filters: FilterQuery<OBSupportTicketSchemaType>,
  options?: {
    skip: number;
    limit: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  },
): Promise<OBSupportTicketSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getTicketsByFilter - find tickets by filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  try {
    const searchQuery: FilterQuery<OBSupportTicketSchemaType> = {};
    if (options && options.search) {
      const searchRegex = new RegExp(options.search, 'i');
      searchQuery.$or = [{ ticketRefId: searchRegex }, { title: searchRegex }];
    }

    const sortQuery: QueryOptions<OBSupportTicketSchemaType> = {};
    if (options && options.sortField) {
      sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
    } else {
      sortQuery.createdAt = -1; // Default sort by createdAt in descending order
    }

    const ticketQueryCursor = OBSupportTicketModel.find({
      ...filters,
      ...searchQuery,
    })
      .sort(sortQuery)
      .skip(options?.skip ?? 0)
      .limit(options?.limit ?? 100)
      .cursor();

    const filteredTickets: OBSupportTicketSchemaType[] = [];

    for await (const ticket of ticketQueryCursor) {
      filteredTickets.push(ticket.toJSON());
    }

    if (!filteredTickets.length) {
      return [];
    }

    const supportTickets = await Promise.all(
      filteredTickets.map(async (ticket) => {
        const attachments =
          ticket.multiMedias?.map(async (media) => {
            if (media.mediaType === MultiMediaEnum.Image) {
              const signedUrl = await multiMediaService.readFileFromS3(transactionId, {
                key: media.image.url,
                readType: ReadFileTypeEnum.PresignedUrl,
              });

              return {
                ...media,
                image: {
                  ...media.image,
                  url: signedUrl as string,
                },
              };
            }

            return media;
          }) ?? [];

        return {
          ...ticket,
          multiMedias: await Promise.all(attachments),
        };
      }),
    );

    logInfo(
      `[${transactionId}] [SERVICE] getTicketsByFilter - all tickets retrieved filters: ${JSON.stringify(
        filters,
      )} and count: ${filteredTickets.length}`,
    );

    return supportTickets;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getTicketsByFilter - FAILED,  reason: ${listErr.message}`);
    throw listErr;
  }
};

const createTicket = async (transactionId: string, ticket: SupportTicketUpsertOperationType): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] createTicket - creating ticket for ticketRefId: ${ticket.ticketRefId}`);
  try {
    if (!ticket.title || !ticket.ticketType || !ticket.priority || !ticket.ticketStatus || !ticket.initiatorType) {
      throw new Error('Required fields are missing');
    }

    if (!ticket.ticketRefId) {
      ticket.ticketRefId = 'ST' + createNanoId(5);
    }

    if (ticket.multiMedias) {
      for (let i = 0; i < ticket.multiMedias.length; i++) {
        ticket.multiMedias[i] = await multiMediaService.storeMultiMedia(
          transactionId,
          ticket.multiMedias[i],
          S3FoldersEnum.SupportTickets,
        );
      }
    }

    if (ticket.assignedPsIds) {
      const assignedUsers = await userService.getObUsersByPsIds(transactionId, ticket.assignedPsIds);
      if (Array.isArray(assignedUsers) && assignedUsers.length < ticket.assignedPsIds.length) {
        throw new Error("Some or all assignedPsIds don't exist in the system.");
      }
    }

    if (ticket.assignedBranchIds) {
      const assignedBranches = await locationService.getAllBranchesByIds(transactionId, ticket.assignedBranchIds);
      if (Array.isArray(assignedBranches) && assignedBranches.length < ticket.assignedBranchIds.length) {
        throw new Error("Some or all assignedBranchIds don't exist in the system.");
      }
    }

    if (ticket.initiatedUser?.employeePsId) {
      const initiatedUser = await userService.getObUsersByPsId(transactionId, ticket.initiatedUser.employeePsId);
      if (!initiatedUser) {
        throw new Error('initiatedUserPsId not found in system.');
      }
    }

    const serviceSuitableTicket = mapSupportTicketServiceRequestToDBRecord(ticket);
    const newticket = new OBSupportTicketModel(serviceSuitableTicket);

    const createdticket = await newticket.save();

    logInfo(
      `[${transactionId}] [SERVICE] createTicket - SUCCESSFUL for ticketRefId: ${serviceSuitableTicket.ticketRefId}`,
    );

    return createdticket.ticketRefId;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createTicket - FAILED for ticketRefId: ${ticket.ticketRefId}, reason: ${createErr.message}`,
    );
    logDebug(`[${transactionId}] [SERVICE] createTicket - FAILED details, provided: ${JSON.stringify(ticket)}`);

    throw createErr;
  }
};

const updateTicket = async (
  transactionId: string,
  ticketPartialFields: Partial<SupportTicketUpsertOperationType>,
): Promise<string> => {
  logInfo(
    `[${transactionId}] [SERVICE] updateTicket - updating ticket for ticketRefId: ${ticketPartialFields.ticketRefId}`,
  );
  OBSupportTicketModel.find;
  try {
    if (!ticketPartialFields.ticketRefId) {
      throw new Error('Missing mandatory field ticketRefId for update');
    }

    if (ticketPartialFields.multiMedias) {
      const oldTicket = await getTicketByRefId(transactionId, ticketPartialFields.ticketRefId);
      let oldTicketMultiMediasUrls = new Set<string>();
      if (Array.isArray(oldTicket.multiMedias) && oldTicket.multiMedias.length > 0) {
        // Get previously uploaded multimedias to delete them
        oldTicketMultiMediasUrls = new Set<string>(
          oldTicket.multiMedias.map((multiMedia) =>
            multiMedia.mediaType === MultiMediaEnum.Image ? multiMedia.image.url : multiMedia.video.url,
          ),
        );
      }

      for (let i = 0; i < ticketPartialFields.multiMedias.length; i++) {
        ticketPartialFields.multiMedias[i] = await multiMediaService.storeMultiMedia(
          transactionId,
          ticketPartialFields.multiMedias[i],
          S3FoldersEnum.SupportTickets,
        );
      }

      oldTicketMultiMediasUrls.forEach((oldTicketMultiMediaUrl) => {
        multiMediaService.deleteFileS3(transactionId, oldTicketMultiMediaUrl);
      });
    }

    if (ticketPartialFields.assignedPsIds) {
      const assignedUsers = await userService.getObUsersByPsIds(transactionId, ticketPartialFields.assignedPsIds);
      if (Array.isArray(assignedUsers) && assignedUsers.length < ticketPartialFields.assignedPsIds.length) {
        throw new Error("Some or all assignedPsIds don't exist in the system.");
      }
    }

    if (ticketPartialFields.assignedBranchIds) {
      const assignedBranches = await locationService.getAllBranchesByIds(
        transactionId,
        ticketPartialFields.assignedBranchIds,
      );
      if (Array.isArray(assignedBranches) && assignedBranches.length < ticketPartialFields.assignedBranchIds.length) {
        throw new Error("Some or all assignedBranchIds don't exist in the system.");
      }
    }

    if (ticketPartialFields.initiatedUser?.employeePsId) {
      const initiatedUser = await userService.getObUsersByPsId(
        transactionId,
        ticketPartialFields.initiatedUser.employeePsId,
      );
      if (!initiatedUser) {
        throw new Error('initiatedUserPsId not found in system.');
      }
    }

    const serviceSuitableTicket = mapSupportTicketServiceRequestToDBRecord(ticketPartialFields);

    const updatedTicket = await OBSupportTicketModel.findOneAndUpdate(
      {
        ticketRefId: serviceSuitableTicket.ticketRefId,
      },
      {
        ...serviceSuitableTicket,
        updatedAt: new Date(),
      },
      {
        new: true,
      },
    );

    logInfo(
      `[${transactionId}] [SERVICE] updateTicket - updating Ticket for ticketRefId: ${serviceSuitableTicket.ticketRefId}`,
    );

    return updatedTicket.ticketRefId;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updateTicket - FAILED for ticketRefId: ${ticketPartialFields.ticketRefId}, reason: ${updateErr.message}`,
    );
    logDebug(
      `[${transactionId}] [SERVICE] updateTicket - FAILED details, provided: ${JSON.stringify(ticketPartialFields)}`,
    );

    throw updateErr;
  }
};

const sendSupportTicketEmail = async (
  transactionId: string,
  ticket: SupportTicketUpsertOperationType,
): Promise<string> => {
  const {
    initiatedUser,
    ticketRefId,
    title,
    priority,
    ticketStatus,
    ticketType,
    tags,
    summary,
    multiMedias = [],
  } = ticket;

  try {
    if (
      !initiatedUser?.displayName ||
      !initiatedUser?.employeeEmail ||
      !ticketRefId ||
      !title ||
      !priority ||
      !ticketType ||
      !ticketStatus
    ) {
      throw new Error('Required fields are missing');
    }

    const attachments = (multiMedias || [])
      ?.filter(({ type, image, video, document }) => type === 'Buffer' && (image || video || document))
      .map(({ image, video, document }) => {
        const { buffer, url } = image || video || document;

        return { filename: url.substring(url.lastIndexOf('/') + 1), content: buffer.buffer };
      });

    const supportEmail = config.get('Features.support.supportEmailAddress') as string;

    const emailSubject = `User ${initiatedUser.displayName} with email ${initiatedUser.employeeEmail} has requested for support`;
    const emailBody = `Dear Onebayshore Team,\n\nWe would like to inform you that there is an update on your support ticket with the following details:\n\n\t- Ticket Number: #${ticketRefId}\n\t- Title: ${title}\n\t- Priority: ${priority}\n\t- Status: ${ticketStatus}\n\t- Type: ${ticketType}\n ${
      tags ? `\t- Tags: ${tags}\n` : ''
    }${summary ? `\t- Summary: ${summary}` : ''}`;

    // Send the email
    const messageId = await emailService.sendEmail(transactionId, {
      recipientEmails: [supportEmail],
      emailSubject,
      emailBody,
      ...(attachments.length > 0 && { attachments }),
    });

    logInfo(`[${transactionId}] [SERVICE] [sendSupportTicketEmail] Email sent for ticketRefId: ${ticketRefId}`);

    return messageId;
  } catch (sendEmailErr) {
    logError(
      `[${transactionId}] [SERVICE] [sendSupportTicketEmail] FAILED for ticketRefId: ${ticketRefId}, reason: ${sendEmailErr.message}`,
    );
    throw sendEmailErr;
  }
};

export { updateTicket, createTicket, getTicketsByFilter, getTicketByRefId, sendSupportTicketEmail };
