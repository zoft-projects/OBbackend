import config from 'config';
import {
  PriorityEnum,
  MultiMediaEnum,
  TicketEnum,
  RequestModeEnum,
  BugStatusEnum,
  FileTransportEnum,
} from '../../enums';
import {
  HttpPOSTUpsertSupportTicket,
  SupportTicketUpsertOperationType,
  FileBufferDataType,
  OBSupportTicketSchemaType,
  SupportTicketPayloadType,
} from '../../types';

const bucketNameS3: string = config.get('Services.s3.bucketName');

const mapSupportTicketServiceRequestToDBRecord = (
  ticket: Partial<SupportTicketUpsertOperationType>,
): Partial<OBSupportTicketSchemaType> => {
  const mappedTicket: Partial<OBSupportTicketSchemaType> = {
    ticketRefId: ticket.ticketRefId,
  };

  if (ticket.title) {
    mappedTicket.title = ticket.title;
  }

  if (ticket.summary) {
    mappedTicket.summary = ticket.summary;
  }

  if (ticket.ticketType && ticket.ticketType in TicketEnum) {
    mappedTicket.ticketType = ticket.ticketType as TicketEnum;
  }

  if (ticket.priority && ticket.priority in PriorityEnum) {
    mappedTicket.priority = ticket.priority as PriorityEnum;
  }

  if (Array.isArray(ticket.tags) && ticket.tags.length > 0) {
    mappedTicket.tags = ticket.tags;
  }

  if (Array.isArray(ticket.categories) && ticket.categories.length > 0) {
    mappedTicket.categories = ticket.categories;
  }

  if (Array.isArray(ticket.assignedPsIds) && ticket.assignedPsIds.length > 0) {
    mappedTicket.assignedPsIds = ticket.assignedPsIds;
  }

  if (Array.isArray(ticket.assignedBranchIds) && ticket.assignedBranchIds.length > 0) {
    mappedTicket.assignedBranchIds = ticket.assignedBranchIds;
  }

  if (ticket.ticketStatus && ticket.ticketStatus in BugStatusEnum) {
    mappedTicket.ticketStatus = ticket.ticketStatus as BugStatusEnum;
  }

  if (ticket.initiatorType && ticket.initiatorType in RequestModeEnum) {
    mappedTicket.initiatorType = ticket.initiatorType as RequestModeEnum;
  }

  if (ticket.initiatedUser) {
    mappedTicket.initiatedUser = {
      employeePsId: ticket.initiatedUser.employeePsId,
      employeeEmail: ticket.initiatedUser.employeeEmail,
      displayName: ticket.initiatedUser.displayName,
    };
  }

  if (ticket.stepsToReproduce) {
    mappedTicket.stepsToReproduce = ticket.stepsToReproduce;
  }

  if (Array.isArray(ticket.multiMedias) && ticket.multiMedias.length > 0) {
    mappedTicket.multiMedias = [];
    for (const multiMedia of ticket.multiMedias) {
      if (multiMedia.image) {
        mappedTicket.multiMedias.push({
          image: {
            url: multiMedia.image.url,
            bucketName: multiMedia.image.bucketName,
            height: multiMedia.image.height,
            width: multiMedia.image.width,
            orientation: multiMedia.image.orientation,
          },
          mediaType: MultiMediaEnum.Image,
        });
      } else if (multiMedia.video) {
        mappedTicket.multiMedias.push({
          video: {
            url: multiMedia.video.url,
            bucketName: multiMedia.video.bucketName,
            sourceType: multiMedia.video.sourceType,
          },
          mediaType: MultiMediaEnum.Video,
        });
      }
    }
  }

  if (ticket.resolutionNote) {
    mappedTicket.resolutionNote = ticket.resolutionNote;
  }

  if (ticket.updatedBy) {
    mappedTicket.updatedBy = ticket.updatedBy;
  }

  if (ticket.createdAt) {
    mappedTicket.createdAt = new Date(ticket.createdAt);
  }

  if (ticket.updatedAt) {
    mappedTicket.updatedAt = new Date(ticket.updatedAt);
  }

  return mappedTicket as OBSupportTicketSchemaType;
};

const mapSupportTicketApiRequestToServiceRequest = (
  requestData: HttpPOSTUpsertSupportTicket,
  files?: FileBufferDataType[],
): SupportTicketUpsertOperationType => {
  const mappedTicket: Partial<SupportTicketUpsertOperationType> = {};
  mappedTicket.ticketRefId = requestData.ticketRefId;

  if (requestData.title) {
    mappedTicket.title = requestData.title;
  }

  if (requestData.summary) {
    mappedTicket.summary = requestData.summary;
  }

  if (requestData.ticketType && requestData.ticketType in TicketEnum) {
    mappedTicket.ticketType = requestData.ticketType;
  }

  if (requestData.priority && requestData.priority in PriorityEnum) {
    mappedTicket.priority = requestData.priority;
  }

  if (Array.isArray(requestData.tags) && requestData.tags.length > 0) {
    mappedTicket.tags = requestData.tags;
  }

  if (Array.isArray(requestData.categories) && requestData.categories.length > 0) {
    mappedTicket.categories = requestData.categories;
  }

  if (Array.isArray(requestData.assignedPsIds) && requestData.assignedPsIds.length > 0) {
    mappedTicket.assignedPsIds = requestData.assignedPsIds;
  }

  if (Array.isArray(requestData.assignedBranchIds) && requestData.assignedBranchIds.length > 0) {
    mappedTicket.assignedBranchIds = requestData.assignedBranchIds;
  }

  if (requestData.ticketStatus && requestData.ticketStatus in BugStatusEnum) {
    mappedTicket.ticketStatus = requestData.ticketStatus;
  }

  if (requestData.initiatorType && requestData.initiatorType in RequestModeEnum) {
    mappedTicket.initiatorType = requestData.initiatorType;
  }

  if (requestData.initiatedUserPsId) {
    mappedTicket.initiatedUser = {
      employeePsId: requestData.initiatedUserPsId,
      employeeEmail: requestData.initiatedUserEmail,
      displayName: requestData.initiatedUserName,
    };
  }

  if (requestData.stepsToReproduce) {
    mappedTicket.stepsToReproduce = requestData.stepsToReproduce;
  }

  if (Array.isArray(requestData.multiMedias) && requestData.multiMedias.length > 0) {
    mappedTicket.multiMedias = [];
    let files_position = 0;
    for (const requestDataMedia of requestData.multiMedias) {
      let multimedia = {};
      if (requestDataMedia.fileType === FileTransportEnum.Link) {
        multimedia = {
          ...multimedia,
          type: FileTransportEnum.Link,
        };

        if (requestDataMedia.mediaType === MultiMediaEnum.Image && requestDataMedia.imageUrl) {
          multimedia = {
            ...multimedia,
            image: {
              url: requestDataMedia.imageUrl,
              bucketName: bucketNameS3,
            },
          };
        } else if (requestDataMedia.mediaType === MultiMediaEnum.Video && requestDataMedia.videoUrl) {
          multimedia = {
            ...multimedia,
            video: {
              url: requestDataMedia.videoUrl,
              bucketName: bucketNameS3,
            },
          };
        }
      } else if (requestDataMedia.fileType === FileTransportEnum.Buffer && files_position < files.length) {
        multimedia = {
          ...multimedia,
          type: FileTransportEnum.Buffer,
        };

        const fileData = {
          fieldName: files[files_position].fieldName,
          originalName: files[files_position].originalName,
          encoding: files[files_position].encoding,
          mimetype: files[files_position].mimetype,
          size: files[files_position].size,
          buffer: files[files_position].buffer,
        };

        files_position++;

        if (requestDataMedia.mediaType === MultiMediaEnum.Image) {
          multimedia = {
            ...multimedia,
            image: {
              buffer: fileData,
              bucketName: bucketNameS3,
            },
          };
        } else if (requestDataMedia.mediaType === MultiMediaEnum.Video) {
          multimedia = {
            ...multimedia,
            video: {
              buffer: fileData,
              bucketName: bucketNameS3,
            },
          };
        } else if (requestDataMedia.mediaType === MultiMediaEnum.Document) {
          multimedia = {
            ...multimedia,
            document: {
              buffer: fileData,
              bucketName: bucketNameS3,
            },
          };
        }
      }
      mappedTicket.multiMedias.push(multimedia);
    }
  }

  if (requestData.resolutionNote) {
    mappedTicket.resolutionNote = requestData.resolutionNote;
  }

  // TODO remove after migration
  if (requestData.createdAt) {
    mappedTicket.createdAt = new Date(requestData.createdAt);
  }

  if (requestData.updatedAt) {
    mappedTicket.updatedAt = new Date(requestData.updatedAt);
  }

  return mappedTicket as SupportTicketUpsertOperationType;
};

const mapDBSupportTicketsToApiPayload = (obSupportTicket: OBSupportTicketSchemaType): SupportTicketPayloadType => {
  const mappedTicket: Partial<SupportTicketPayloadType> = {
    ticketRefId: obSupportTicket.ticketRefId,
    title: obSupportTicket.title,
  };

  if (obSupportTicket.summary) {
    mappedTicket.summary = obSupportTicket.summary;
  }

  if (obSupportTicket.ticketType && obSupportTicket.ticketType in TicketEnum) {
    mappedTicket.type = obSupportTicket.ticketType;
  }

  if (obSupportTicket.priority && obSupportTicket.priority in PriorityEnum) {
    mappedTicket.priority = obSupportTicket.priority;
  }

  if (obSupportTicket.tags?.length) {
    mappedTicket.tags = obSupportTicket.tags;
  }

  if (obSupportTicket.ticketStatus && obSupportTicket.ticketStatus in BugStatusEnum) {
    mappedTicket.status = obSupportTicket.ticketStatus;
  }

  if (obSupportTicket.multiMedias) {
    // TODO: Only image attachments from support tickets are considered for the mobile interface.
    mappedTicket.attachments = obSupportTicket.multiMedias.map((media) => {
      return { imageUrl: media.image.url };
    });
  }

  if (obSupportTicket.initiatedUser?.employeePsId) {
    mappedTicket.initiatedUser = {
      employeePsId: obSupportTicket.initiatedUser.employeePsId,
      employeeEmail: obSupportTicket.initiatedUser.employeeEmail,
      displayName: obSupportTicket.initiatedUser.displayName,
    };
  }

  if (obSupportTicket.createdAt) {
    mappedTicket.createdDate = new Date(obSupportTicket.createdAt);
  }

  return mappedTicket as SupportTicketPayloadType;
};

export {
  mapSupportTicketServiceRequestToDBRecord,
  mapSupportTicketApiRequestToServiceRequest,
  mapDBSupportTicketsToApiPayload,
};
