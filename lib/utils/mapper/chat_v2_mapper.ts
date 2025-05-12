import config from 'config';
import { ActiveStateEnum, ChatGroupEnum, ChatGroupStatusEnum, UserAccessModeEnum } from '../../enums';
import {
  OBChatV2AccessControlMetaType,
  OBChatV2GroupSchemaType,
  OBChatV2LastMessageActivityType,
  OBChatV2MetricsMetaType,
  ChatV2GroupPayloadType,
  OBChatV2UserSchemaType,
  OBChatV2UserImageType,
  HttpPUTUpdateChatV2GroupInputType,
  OBBranchSchemaType,
  ChatV2GroupDetailsPayloadType,
} from '../../types';
import { isArrayExists, isBoolean, isNumber, isValidDate } from '../helper/helper';

const {
  canFieldStaffReply,
  attachmentsAllowed,
  richTextSupported,
  captureActivities,
  notificationsPaused,
  maxUsersAllowedInChat,
  availableOnWeekends,
  chatOpenHour,
  chatCloseHour,
}: {
  canFieldStaffReply: boolean;
  attachmentsAllowed: boolean;
  richTextSupported: boolean;
  captureActivities: boolean;
  notificationsPaused: boolean;
  maxUsersAllowedInChat: number;
  availableOnWeekends: boolean;
  chatOpenHour: number;
  chatCloseHour: number;
} = config.get('Features.chat');

const mapChatV2GroupRequestToDBRecord = (requestData: Partial<OBChatV2GroupSchemaType>): OBChatV2GroupSchemaType => {
  const mappedChatGroupData: Partial<OBChatV2GroupSchemaType> = {};

  if (requestData.groupId) {
    mappedChatGroupData.groupId = requestData.groupId;
  }

  if (requestData.vendorGroupId) {
    mappedChatGroupData.vendorGroupId = requestData.vendorGroupId;
  }

  if (requestData.groupName) {
    mappedChatGroupData.groupName = requestData.groupName;
  }

  if (requestData.branchId) {
    mappedChatGroupData.branchId = requestData.branchId;
  }

  if (requestData.groupType in ChatGroupEnum) {
    mappedChatGroupData.groupType = requestData.groupType;
  }

  if (requestData.groupCategory) {
    mappedChatGroupData.groupCategory = requestData.groupCategory;
  }

  if (requestData.activeStatus in ChatGroupStatusEnum) {
    mappedChatGroupData.activeStatus = requestData.activeStatus;
  }
  if (requestData.createdBy) {
    mappedChatGroupData.createdBy = requestData.createdBy;
  }
  if (requestData.createdByPsId) {
    mappedChatGroupData.createdByPsId = requestData.createdByPsId;
  }
  if (requestData.updatedByPsId) {
    mappedChatGroupData.updatedByPsId = requestData.updatedByPsId;
  }

  if (requestData.createdAt) {
    mappedChatGroupData.createdAt = new Date(requestData.createdAt);
  }
  if (requestData.updatedAt) {
    mappedChatGroupData.updatedAt = new Date(requestData.updatedAt);
  }
  if (requestData.intendedForPsId) {
    mappedChatGroupData.intendedForPsId = requestData.intendedForPsId;
  }

  // Group image
  if (requestData.groupImage?.uri) {
    mappedChatGroupData.groupImage = {
      bucketName: requestData.groupImage.bucketName,
      uri: requestData.groupImage.uri,
    };
  }

  // Access control meta
  if (requestData.accessControlMeta) {
    const metadata = requestData.accessControlMeta;
    mappedChatGroupData.accessControlMeta = {} as OBChatV2AccessControlMetaType;

    if (metadata.maxUsersAllowed) {
      mappedChatGroupData.accessControlMeta.maxUsersAllowed = metadata.maxUsersAllowed;
    } else {
      mappedChatGroupData.accessControlMeta.maxUsersAllowed = maxUsersAllowedInChat;
    }

    mappedChatGroupData.accessControlMeta.bidirectional =
      typeof metadata.bidirectional === 'boolean' ? metadata.bidirectional : canFieldStaffReply;

    mappedChatGroupData.accessControlMeta.attachmentsAllowed =
      typeof metadata.attachmentsAllowed === 'boolean' ? metadata.attachmentsAllowed : attachmentsAllowed;

    mappedChatGroupData.accessControlMeta.richTextSupported =
      typeof metadata.richTextSupported === 'boolean' ? metadata.richTextSupported : richTextSupported;

    mappedChatGroupData.accessControlMeta.captureActivities =
      typeof metadata.captureActivities === 'boolean' ? metadata.captureActivities : captureActivities;

    mappedChatGroupData.accessControlMeta.notificationsPaused =
      typeof metadata.notificationsPaused === 'boolean' ? metadata.notificationsPaused : notificationsPaused;

    if (metadata.notificationsPausedUntil) {
      mappedChatGroupData.accessControlMeta.notificationsPausedUntil = new Date(metadata.notificationsPausedUntil);
    }

    if (metadata.chatOpenHour) {
      mappedChatGroupData.accessControlMeta.chatOpenHour = metadata.chatOpenHour;
    } else {
      mappedChatGroupData.accessControlMeta.chatOpenHour = chatOpenHour;
    }

    if (metadata.chatCloseHour) {
      mappedChatGroupData.accessControlMeta.chatCloseHour = metadata.chatCloseHour;
    } else {
      mappedChatGroupData.accessControlMeta.chatCloseHour = chatCloseHour;
    }

    mappedChatGroupData.accessControlMeta.availableOnWeekends =
      typeof metadata.availableOnWeekends === 'boolean' ? metadata.availableOnWeekends : availableOnWeekends;
  }

  if (requestData.metricsMeta) {
    const { totalActiveAdminCount, totalUserCount, totalActiveUserCount } = requestData.metricsMeta;
    mappedChatGroupData.metricsMeta = {} as OBChatV2MetricsMetaType;

    if (typeof totalActiveAdminCount !== 'undefined') {
      mappedChatGroupData.metricsMeta.totalActiveAdminCount = totalActiveAdminCount;
    }
    if (typeof totalUserCount !== 'undefined') {
      mappedChatGroupData.metricsMeta.totalUserCount = totalUserCount;
    }
    if (typeof totalActiveUserCount !== 'undefined') {
      mappedChatGroupData.metricsMeta.totalActiveUserCount = totalActiveUserCount;
    }
  }

  if (requestData.lastMessageActivity) {
    const { message, messageStatus, timestamp } = requestData.lastMessageActivity;
    mappedChatGroupData.lastMessageActivity = {} as OBChatV2LastMessageActivityType;

    if (message) {
      mappedChatGroupData.lastMessageActivity.message = message;
    }
    if (messageStatus) {
      mappedChatGroupData.lastMessageActivity.messageStatus = messageStatus;
    }
    if (timestamp) {
      mappedChatGroupData.lastMessageActivity.timestamp = new Date(timestamp);
    }
  }

  if (requestData.activeUntil) {
    mappedChatGroupData.activeUntil = new Date(requestData.activeUntil);
  }

  return mappedChatGroupData as OBChatV2GroupSchemaType;
};

const mapDBChatV2GroupToApiPayload = (
  obChatGroup: OBChatV2GroupSchemaType & { signedGroupImageUrl?: string },
  dependencies: {
    readGroupReceipts?: {
      groupId: string;
      messageId: string;
      messageStatus: 'MessageSent' | 'MessageRead';
    }[];
  } = {},
): ChatV2GroupPayloadType => {
  const { readGroupReceipts = [] } = dependencies;

  const mappedGroup: Partial<ChatV2GroupPayloadType> = {
    groupId: obChatGroup.groupId,
    vendorGroupId: obChatGroup.vendorGroupId,
    groupName: obChatGroup.groupName,
    branchId: obChatGroup.branchId,
  };

  if (obChatGroup.groupType in ChatGroupEnum) {
    mappedGroup.groupType = obChatGroup.groupType as ChatGroupEnum;
  }

  // Group signed image URL
  if (obChatGroup.signedGroupImageUrl) {
    mappedGroup.groupImageUrl = obChatGroup.signedGroupImageUrl;
  }

  // Access Control Metadata
  if (obChatGroup.accessControlMeta) {
    const metadata = obChatGroup.accessControlMeta;
    mappedGroup.metadata = {} as ChatV2GroupPayloadType['metadata'];

    mappedGroup.metadata.canFieldStaffReply = Boolean(metadata.bidirectional);
    mappedGroup.metadata.attachmentsAllowed = Boolean(metadata.attachmentsAllowed);
    mappedGroup.metadata.richTextSupported = Boolean(metadata.richTextSupported);

    if (typeof metadata.chatOpenHour !== 'undefined') {
      mappedGroup.metadata.chatOpenHour = metadata.chatOpenHour;
    }

    if (typeof metadata.chatCloseHour !== 'undefined') {
      mappedGroup.metadata.chatCloseHour = metadata.chatCloseHour;
    }

    mappedGroup.metadata.availableOnWeekends = true; // TODO Setting as true until groups are synced
  }

  // Last Message Activity
  if (obChatGroup.lastMessageActivity?.message && obChatGroup.lastMessageActivity?.timestamp) {
    mappedGroup.previewMessage = obChatGroup.lastMessageActivity.message;
    mappedGroup.previewTimestamp = new Date(obChatGroup.lastMessageActivity.timestamp).toISOString();
  }

  if (obChatGroup.activeStatus) {
    mappedGroup.status = obChatGroup.activeStatus;
  }

  readGroupReceipts.forEach((receipt) => {
    if (receipt.groupId !== obChatGroup.groupId) {
      return;
    }

    mappedGroup.userLastReadMessageId = receipt.messageId;
  });

  return mappedGroup as ChatV2GroupPayloadType;
};

const mapDBChatV2GroupDetailsToApiPayload = (
  obChatGroup: OBChatV2GroupSchemaType & { signedGroupImageUrl?: string },
  groupContacts: OBChatV2UserSchemaType[],
  dependencies: {
    groupBranch?: OBBranchSchemaType;
    targetPsId?: string;
    shouldRenameGroup?: boolean;
  } = {},
): ChatV2GroupDetailsPayloadType => {
  const { groupBranch, targetPsId, shouldRenameGroup } = dependencies;

  const mappedGroup: Partial<ChatV2GroupDetailsPayloadType> = {
    groupId: obChatGroup.groupId,
    vendorGroupId: obChatGroup.vendorGroupId,
    groupName: obChatGroup.groupName,
    branchId: obChatGroup.branchId,
  };

  if (obChatGroup.groupType in ChatGroupEnum) {
    mappedGroup.groupType = obChatGroup.groupType as ChatGroupEnum;
  }

  // Group signed image URL
  if (obChatGroup.signedGroupImageUrl) {
    mappedGroup.groupImageUrl = obChatGroup.signedGroupImageUrl;
  }

  // Access Control Metadata
  if (obChatGroup.accessControlMeta) {
    const metadata = obChatGroup.accessControlMeta;
    mappedGroup.metadata = {} as ChatV2GroupDetailsPayloadType['metadata'];

    mappedGroup.metadata.canFieldStaffReply = Boolean(metadata.bidirectional);
    mappedGroup.metadata.attachmentsAllowed = Boolean(metadata.attachmentsAllowed);
    mappedGroup.metadata.richTextSupported = Boolean(metadata.richTextSupported);
    mappedGroup.metadata.availableOnWeekends = Boolean(metadata.availableOnWeekends) || true; // TODO Setting as true until groups are synced
    mappedGroup.metadata.captureActivities = Boolean(metadata.captureActivities);
    mappedGroup.metadata.notificationsPaused = Boolean(metadata.notificationsPaused);

    if (metadata.notificationsPausedUntil && isValidDate(metadata.notificationsPausedUntil)) {
      mappedGroup.metadata.notificationsPausedUntil = new Date(metadata.notificationsPausedUntil);
    }

    if (isNumber(metadata.maxUsersAllowed)) {
      mappedGroup.metadata.maxUsersAllowed = metadata.maxUsersAllowed;
    }

    if (isNumber(metadata.chatOpenHour)) {
      mappedGroup.metadata.chatOpenHour = metadata.chatOpenHour;
    }

    if (isNumber(metadata.chatCloseHour)) {
      mappedGroup.metadata.chatCloseHour = metadata.chatCloseHour;
    }
  }

  // Last Message Activity
  if (obChatGroup.lastMessageActivity?.message && obChatGroup.lastMessageActivity?.timestamp) {
    mappedGroup.previewMessage = obChatGroup.lastMessageActivity.message;
    mappedGroup.previewTimestamp = new Date(obChatGroup.lastMessageActivity.timestamp).toISOString();
  }

  if (
    obChatGroup.groupType === ChatGroupEnum.DirectMessage &&
    obChatGroup.intendedForPsId === targetPsId &&
    groupBranch &&
    shouldRenameGroup
  ) {
    mappedGroup.groupName = groupBranch.branchName;
  }

  mappedGroup.participants = [];

  if (isArrayExists(groupContacts)) {
    mappedGroup.participants = groupContacts.map((groupContact) => {
      return {
        userPsId: groupContact.employeePsId,
        role: groupContact.accessMode,
      };
    });
  }

  return mappedGroup as ChatV2GroupDetailsPayloadType;
};

const mapChatV2UserRequestToDBRecord = (requestData: Partial<OBChatV2UserSchemaType>): OBChatV2UserSchemaType => {
  const mappedUserData: Partial<OBChatV2UserSchemaType> = {
    employeePsId: requestData.employeePsId,
    vendorUserId: requestData.vendorUserId,
    groupId: requestData.groupId,
    vendorGroupId: requestData.vendorGroupId,
    branchId: requestData.branchId,
  };

  if (requestData.employeeName) {
    mappedUserData.employeeName = requestData.employeeName;
  }

  if (requestData.employeeImage) {
    const { bucketName, uri } = requestData.employeeImage;
    mappedUserData.employeeImage = {} as OBChatV2UserImageType;

    if (bucketName) {
      mappedUserData.employeeImage.bucketName = bucketName;
    }
    if (uri) {
      mappedUserData.employeeImage.uri = uri;
    }
  }

  if (requestData.accessMode && requestData.accessMode in UserAccessModeEnum) {
    mappedUserData.accessMode = requestData.accessMode;
  }

  if (requestData.activeStatus && requestData.activeStatus in ActiveStateEnum) {
    mappedUserData.activeStatus = requestData.activeStatus;
  }

  if (typeof requestData.muteNotifications === 'boolean') {
    mappedUserData.muteNotifications = requestData.muteNotifications;
  }
  if (requestData.muteNotificationsUntil && isValidDate(requestData.muteNotificationsUntil)) {
    mappedUserData.muteNotificationsUntil = new Date(requestData.muteNotificationsUntil);
  }

  if (requestData.lastSeenAt && isValidDate(requestData.lastSeenAt)) {
    mappedUserData.lastSeenAt = new Date(requestData.lastSeenAt);
  }

  if (requestData.createdAt) {
    mappedUserData.createdAt = new Date(requestData.createdAt);
  }

  if (requestData.updatedAt) {
    mappedUserData.updatedAt = new Date(requestData.updatedAt);
  }

  return mappedUserData as OBChatV2UserSchemaType;
};

const compareChatGroupChanges = (
  existingGroup: OBChatV2GroupSchemaType,
  existingUserPsIds: string[],
  updatedPayload: HttpPUTUpdateChatV2GroupInputType,
): {
  canUpdate: boolean;
  updateFields: Partial<OBChatV2GroupSchemaType>;
  addGroupUserPsIds: string[];
  removeGroupUserPsIds: string[];
  typesOfChangesDetected: ('MetaChange' | 'ParticipantChange')[];
} => {
  let canUpdate = false;
  const updateFields: Partial<OBChatV2GroupSchemaType> = {
    groupId: existingGroup.groupId,
  };
  const typesOfChangesDetected = new Set<'MetaChange' | 'ParticipantChange'>();

  // Compare groupName
  if (updatedPayload.groupName && updatedPayload.groupName !== existingGroup.groupName) {
    updateFields.groupName = updatedPayload.groupName;
    typesOfChangesDetected.add('MetaChange');
  }

  // Use Set for faster lookup
  const existingPsIdSet = new Set(existingUserPsIds);
  const addGroupUserPsIds = isArrayExists(updatedPayload.addGroupUserPsIds)
    ? updatedPayload.addGroupUserPsIds.filter((id) => !existingPsIdSet.has(id))
    : [];

  const removeGroupUserPsIds = isArrayExists(updatedPayload.removeGroupUserPsIds)
    ? existingUserPsIds.filter((id) => updatedPayload.removeGroupUserPsIds.includes(id))
    : [];

  if (isArrayExists(addGroupUserPsIds) || isArrayExists(removeGroupUserPsIds)) {
    typesOfChangesDetected.add('ParticipantChange');
  }

  // Compare access control meta fields
  const { accessControlMeta: existingMeta } = existingGroup;
  const updateAccessControlMeta: Partial<OBChatV2AccessControlMetaType> = {};

  if (
    isBoolean(updatedPayload.canFieldStaffReply) &&
    updatedPayload.canFieldStaffReply !== existingMeta.bidirectional
  ) {
    updateAccessControlMeta.bidirectional = updatedPayload.canFieldStaffReply;
  }

  if (
    isBoolean(updatedPayload.notificationsPaused) &&
    updatedPayload.notificationsPaused !== existingMeta.notificationsPaused
  ) {
    updateAccessControlMeta.notificationsPaused = updatedPayload.notificationsPaused;
  }

  if (
    updatedPayload.notificationsPausedUntil &&
    new Date(updatedPayload.notificationsPausedUntil).toISOString() !==
      existingMeta.notificationsPausedUntil?.toISOString()
  ) {
    updateAccessControlMeta.notificationsPausedUntil = new Date(updatedPayload.notificationsPausedUntil);
  }

  if (
    isBoolean(updatedPayload.attachmentsAllowed) &&
    updatedPayload.attachmentsAllowed !== existingMeta.attachmentsAllowed
  ) {
    updateAccessControlMeta.attachmentsAllowed = updatedPayload.attachmentsAllowed;
  }

  if (
    isBoolean(updatedPayload.richTextSupported) &&
    updatedPayload.richTextSupported !== existingMeta.richTextSupported
  ) {
    updateAccessControlMeta.richTextSupported = updatedPayload.richTextSupported;
  }

  if (
    isBoolean(updatedPayload.captureActivities) &&
    updatedPayload.captureActivities !== existingMeta.captureActivities
  ) {
    updateAccessControlMeta.captureActivities = updatedPayload.captureActivities;
  }

  if (
    isBoolean(updatedPayload.availableOnWeekends) &&
    updatedPayload.availableOnWeekends !== existingMeta.availableOnWeekends
  ) {
    updateAccessControlMeta.availableOnWeekends = updatedPayload.availableOnWeekends;
  }

  if (isNumber(updatedPayload.chatOpenHour) && updatedPayload.chatOpenHour !== existingMeta.chatOpenHour) {
    updateAccessControlMeta.chatOpenHour = updatedPayload.chatOpenHour;
  }

  if (isNumber(updatedPayload.chatCloseHour) && updatedPayload.chatCloseHour !== existingMeta.chatCloseHour) {
    updateAccessControlMeta.chatCloseHour = updatedPayload.chatCloseHour;
  }

  // If any access control meta changes exist, update them
  if (Object.keys(updateAccessControlMeta).length > 0) {
    updateFields.accessControlMeta = { ...existingMeta, ...updateAccessControlMeta };
    typesOfChangesDetected.add('MetaChange');
  }

  // Compare groupImage if provided
  if (updatedPayload.groupImage) {
    if (
      !existingGroup.groupImage ||
      updatedPayload.groupImage.bucketName !== existingGroup.groupImage.bucketName ||
      updatedPayload.groupImage.uri !== existingGroup.groupImage.uri
    ) {
      updateFields.groupImage = updatedPayload.groupImage;
      typesOfChangesDetected.add('MetaChange');
    }
  }

  // Determine if an update is required
  if (Object.keys(updateFields).length > 0 || isArrayExists(addGroupUserPsIds) || isArrayExists(removeGroupUserPsIds)) {
    canUpdate = true;
    updateFields.updatedAt = new Date();
  }

  return {
    canUpdate,
    updateFields,
    addGroupUserPsIds,
    removeGroupUserPsIds,
    typesOfChangesDetected: [...typesOfChangesDetected],
  };
};

export {
  mapChatV2GroupRequestToDBRecord,
  mapDBChatV2GroupToApiPayload,
  mapDBChatV2GroupDetailsToApiPayload,
  mapChatV2UserRequestToDBRecord,
  compareChatGroupChanges,
};
