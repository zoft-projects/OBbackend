import { ChatGroupEnum, UserAccessModeEnum, ChatGroupStatusEnum } from '../../enums';

type ChatV2GroupPayloadType = {
  groupId: string;
  vendorGroupId: string;
  groupName: string;
  groupType: ChatGroupEnum;
  branchId: string;
  status: ChatGroupStatusEnum;
  groupImageUrl?: string;
  recentMessageId?: string;
  userLastReadMessageId?: string;
  previewMessage?: string;
  previewTimestamp?: string;
  metadata: {
    canFieldStaffReply: boolean;
    attachmentsAllowed: boolean;
    richTextSupported: boolean;
    chatOpenHour: number;
    chatCloseHour: number;
    availableOnWeekends: boolean;
  };
};

type ChatV2GroupDetailsPayloadType = {
  groupId: string;
  vendorGroupId: string;
  groupName: string;
  groupType: ChatGroupEnum;
  branchId: string;
  groupImageUrl?: string;
  previewMessage?: string;
  previewTimestamp?: string;
  metadata: {
    canFieldStaffReply: boolean;
    attachmentsAllowed: boolean;
    richTextSupported: boolean;
    captureActivities: boolean;
    notificationsPaused: boolean;
    availableOnWeekends: boolean;
    notificationsPausedUntil?: Date;
    chatOpenHour?: number;
    chatCloseHour?: number;
    maxUsersAllowed?: number;
  };
  participants: {
    userPsId: string;
    role: UserAccessModeEnum;
  }[];
};

type ChatV2AttachmentPayloadType = {
  /**
   * @deprecated use uploadUrls instead
   */
  signedUrls?: string[];
  uploadUrls?: string[];
  uploadId?: string;
  fileIdentifier?: string;
  attachmentUrl?: string;
};

type ChatV2ContactPayloadType = {
  groupId?: string;
  groupName?: string;
  /**
   * @deprecated use userPsId instead
   */
  intendedForPsId?: string;
  role: UserAccessModeEnum;
  branchIds: string[];
  userEmail: string;
  displayName?: string;
  userPsId: string;
  jobId: string;
  jobLevel: number;
  jobTitle: string;
  lastLoggedAt?: string;
};

export { ChatV2GroupPayloadType, ChatV2AttachmentPayloadType, ChatV2ContactPayloadType, ChatV2GroupDetailsPayloadType };
