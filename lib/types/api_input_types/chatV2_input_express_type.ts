import { ChatGroupEnum, MultipartUploadPhaseEnum } from '../../enums';

type HttpPOSTCreateChatV2GroupInputType = {
  branchId: string;
  groupName: string;
  groupType: ChatGroupEnum;
  groupUserPsIds: string[];
  groupImage?: { bucketName: string; uri: string };
  canFieldStaffReply: boolean;
  notificationsPaused?: boolean;
  notificationsPausedUntil?: Date;
  attachmentsAllowed: boolean;
  richTextSupported?: boolean;
  captureActivities?: boolean;
  availableOnWeekends?: boolean;
  chatOpenHour?: number;
  chatCloseHour?: number;
};

type HttpPostChatAttachmentInputType = {
  uploadId?: string;
  phase?: MultipartUploadPhaseEnum;
  multipart?: boolean;
  partsCount?: number;
  fileIdentifier?: string;
  uniqueFileName: string;
  uploadedParts?: {
    etag: string;
    partNumber: number;
  }[];
};

type HttpPUTUpdateChatV2GroupInputType = {
  groupId: string;
  groupName?: string;
  addGroupUserPsIds: string[];
  removeGroupUserPsIds: string[];
  groupImage?: { bucketName: string; uri: string };
  canFieldStaffReply?: boolean;
  notificationsPaused?: boolean;
  notificationsPausedUntil?: string;
  attachmentsAllowed?: boolean;
  richTextSupported?: boolean;
  captureActivities?: boolean;
  availableOnWeekends?: boolean;
  chatOpenHour?: number;
  chatCloseHour?: number;
};

type HttpChatV2ActionInputType = {
  groupId: string;
  actionType: 'MessageSent' | 'MessageRead';
  hasAttachment?: boolean;
  currentBranchId: string;
  messageId?: string;
  textMessage?: string;
  version?: string;
};

export {
  HttpChatV2ActionInputType,
  HttpPOSTCreateChatV2GroupInputType,
  HttpPostChatAttachmentInputType,
  HttpPUTUpdateChatV2GroupInputType,
};
