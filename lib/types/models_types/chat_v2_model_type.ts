import { ChatGroupEnum, ChatGroupStatusEnum, UserAccessModeEnum, UserStatusEnum } from '../../enums';

type OBChatV2GroupImageType = {
  bucketName: string;
  uri: string;
};

type OBChatV2AccessControlMetaType = {
  maxUsersAllowed: number;
  bidirectional: boolean;
  attachmentsAllowed: boolean;
  richTextSupported: boolean;
  captureActivities: boolean;
  notificationsPaused: boolean;
  notificationsPausedUntil?: Date;
  chatOpenHour: number;
  chatCloseHour: number;
  availableOnWeekends: boolean;
};

type OBChatV2MetricsMetaType = {
  totalActiveAdminCount: number;
  totalUserCount: number;
  totalActiveUserCount: number;
};

type OBChatV2LastMessageActivityType = {
  messageId?: string;
  message: string;
  messageStatus: string;
  timestamp: Date;
};

type OBChatV2GroupSchemaType = {
  _id?: string;
  groupId: string;
  vendorGroupId: string; // Stores the ACS `communicationThreadId`
  groupName: string;
  groupImage?: OBChatV2GroupImageType;
  groupType: ChatGroupEnum;
  groupCategory?: string;
  branchId: string;
  intendedForPsId?: string;
  activeStatus: ChatGroupStatusEnum;
  activeUntil?: Date;
  accessControlMeta: OBChatV2AccessControlMetaType;
  metricsMeta: OBChatV2MetricsMetaType;
  lastMessageActivity?: OBChatV2LastMessageActivityType;
  createdBy: string;
  createdByPsId?: string;
  updatedByPsId?: string;
  createdAt: Date;
  updatedAt: Date;
};

type OBChatV2UserImageType = {
  bucketName: string;
  uri: string;
};

type OBChatV2UserSchemaType = {
  _id?: string;
  employeePsId: string;
  vendorUserId: string; // vendorUserId stores the communicationUserId from ACS.
  groupId: string;
  vendorGroupId: string; // vendorGroupId stores the communicationThreadId from ACS.
  branchId: string;
  employeeName: string;
  employeeImage?: OBChatV2UserImageType;
  accessMode: UserAccessModeEnum;
  activeStatus: UserStatusEnum;
  muteNotifications: boolean;
  muteNotificationsUntil?: Date;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export {
  OBChatV2UserImageType,
  OBChatV2UserSchemaType,
  OBChatV2GroupSchemaType,
  OBChatV2GroupImageType,
  OBChatV2AccessControlMetaType,
  OBChatV2MetricsMetaType,
  OBChatV2LastMessageActivityType,
};
