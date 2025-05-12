import { CreateChatThreadResult } from '@azure/communication-chat/types/communication-chat';
import { CommunicationUserIdentifier } from '@azure/communication-common/types/communication-common';
import { CommunicationAccessToken } from '@azure/communication-identity/types/communication-identity';
import config from 'config';
import { FilterQuery, QueryOptions } from 'mongoose';
import { userService, cacheService, jobService, featureProvisioningService, locationService } from '..';
import {
  ActiveStateEnum,
  BranchFeaturesProvisionEnum,
  ChatGroupEnum,
  ChatGroupStatusEnum,
  JobCategoryEnum,
  UserAccessModeEnum,
  UserLevelEnum,
  UserStatusEnum,
  VendorExternalEnum,
} from '../../enums';
import { logError, logInfo, logWarn } from '../../log/util';
import { OBChatV2GroupModel, OBChatV2UserModel } from '../../models';
import {
  ChatGroupParticipantType,
  HttpPUTUpdateChatV2GroupInputType,
  OBChatV2AccessControlMetaType,
  OBChatV2GroupSchemaType,
  OBChatV2MetricsMetaType,
  OBChatV2UserSchemaType,
  OBUserSchemaType,
} from '../../types';
import {
  createNanoId,
  mapAccessLevelToName,
  mapChatV2GroupRequestToDBRecord,
  mapChatV2UserRequestToDBRecord,
  prefixChatGroupId,
  getEffectiveJobRole,
  compareChatGroupChanges,
  getEffectiveBranchIds,
  chunkArray,
  compareLists,
} from '../../utils';
import {
  getAcsUserNewAccessToken,
  getValidAcsAccessToken,
  createNewAcsUser,
  createAcsChatGroup,
  removeAcsChatGroup,
  addAcsChatGroupParticipants,
  initiateMultipartUpload,
  completeMultipartUpload,
  uploadFileToS3,
  createPresignedUrlWithClient,
  removeAcsChatGroupParticipants,
  removeAcsUser,
  listAcsChatGroupParticipants,
} from '../../vendors';

const chatConfig: {
  rootUserPsId: string;
  canFieldStaffReply: boolean;
  attachmentsAllowed: boolean;
  richTextSupported: boolean;
  captureActivities: boolean;
  maxUsersAllowedInChat: number;
  maxAdminsPerChatGroup: number;
  availableOnWeekends: boolean;
  notificationsPaused: boolean;
  chatOpenHour: number;
  chatCloseHour: number;
  systemGroups: { groupName: string; jobCategory: string | null; categoryIdentifier: string }[];
} = config.get('Features.chat');

/**
 * @deprecated use createChatProfileForUser instead
 */
const createNewChatUser = async (transactionId: string): Promise<CommunicationUserIdentifier> => {
  logInfo(`[${transactionId}] [SERVICE] [ChatV2] [createNewChatUser] Starting the creation of a new ACS user.`);

  try {
    const acsUser = await createNewAcsUser(transactionId);

    if (!acsUser?.communicationUserId) {
      throw new Error('Failed to create ACS user: No response received from ACS service.');
    }

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [createNewChatUser] Successfully created ACS user. CommunicationUserId: ${acsUser.communicationUserId}`,
    );

    return acsUser;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [createNewChatUser] Error occurred during ACS user creation. Details: ${error.message}`,
    );
  }
};

const createChatProfileForUser = async (
  transactionId: string,
  userPsId: string,
): Promise<{ userPsId: string; chatUserId: string }> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] [ChatV2] [createChatProfileForUser] initiated for psId: ${userPsId}`);

    const acsUser = await createNewAcsUser(transactionId);

    if (!acsUser?.communicationUserId) {
      throw new Error('Failed to create ACS user: No response received from ACS service.');
    }

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [createChatProfileForUser] communicationUserId created in vendor successfully`,
    );

    // Update user in database
    await userService.updateUserByPsId(transactionId, {
      psId: userPsId,
      vendors: {
        acsCommunicationUserId: acsUser.communicationUserId,
      },
    });

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [createChatProfileForUser] Chat profile setup SUCCESSFULLY for psId: ${userPsId}`,
    );

    return {
      userPsId,
      chatUserId: acsUser.communicationUserId,
    };
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [createChatProfileForUser] Chat profile FAILED, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const fetchChatUserToken = async (
  transactionId: string,
  obUserPsId: string,
  forceRefresh?: boolean,
): Promise<CommunicationAccessToken> => {
  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] fetchChatUserToken called for obUserPsId: ${obUserPsId}, forceRefresh: ${forceRefresh}`,
  );
  const tokenCacheKey = `acsToken_${obUserPsId}`;

  try {
    // Attempt to retrieve token from cache (unless force refresh is requested).
    if (!forceRefresh) {
      const cachedToken = (await cacheService.retrieve(transactionId, {
        serviceName: 'chatService',
        identifier: tokenCacheKey,
      })) as CommunicationAccessToken | null;

      if (cachedToken?.token) {
        logInfo(
          `[${transactionId}] [SERVICE] [ChatV2] Token found in cache for obUserPsId: ${obUserPsId}. Validating...`,
        );
        const validTokenResponse = await getValidAcsAccessToken(transactionId, cachedToken.token);

        // If it’s valid, return immediately
        return validTokenResponse;
      }
      logInfo(`[${transactionId}] [SERVICE] [ChatV2] No valid cached token found for obUserPsId: ${obUserPsId}`);
    }

    // Retrieve user information from your service.
    const obUser = await userService.getObUsersByPsId(transactionId, obUserPsId);
    if (!obUser) {
      throw new Error(`No obUser found for obUserPsId: ${obUserPsId}`);
    }

    // Identify the Azure vendor system.
    const azureVendorSystem = (obUser.vendorSystems || []).find(
      ({ vendorId }) => vendorId === VendorExternalEnum.Azure,
    );

    if (!azureVendorSystem?.vendorValue) {
      throw new Error(`No Azure vendor or vendor value found for obUserPsId: ${obUserPsId}`);
    }

    // Fetch a new ACS token using the communication user ID.
    const newTokenResponse = await getAcsUserNewAccessToken(transactionId, azureVendorSystem.vendorValue);
    logInfo(`[${transactionId}] [SERVICE] [ChatV2] Successfully generated new ACS token for obUserPsId: ${obUserPsId}`);

    // Store new token in the cache (expires in 2 hours).
    await cacheService.persist(transactionId, {
      serviceName: 'chatService',
      identifier: tokenCacheKey,
      data: newTokenResponse,
      expires: '2h',
    });
    logInfo(`[${transactionId}] [SERVICE] [ChatV2] Cached new ACS token for obUserPsId: ${obUserPsId}`);

    return newTokenResponse;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] Failed to retrieve ACS token for obUserPsId: ${obUserPsId}. Error: ${error?.message}`,
    );
    throw error;
  }
};

const fetchAcsCredentialsByUserPsId = async (
  transactionId: string,
  userPsId: string,
): Promise<{
  communicationUserId: string;
  token: string;
  expiresOn: Date;
}> => {
  logInfo(
    `${transactionId}] [fetchAcsCredentialsByUserPsId] Fetching ACS token and communicationUserId for userPsId: ${userPsId}`,
  );

  try {
    // Fetch user details by user PsId
    const user = await userService.getObUsersByPsId(transactionId, userPsId);

    // Find Azure Communication system data
    const azureSystem = user.vendorSystems?.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);

    if (!azureSystem?.vendorValue) {
      throw new Error(`Azure vendor system or value not found for user ID: ${userPsId}`);
    }

    // Fetch ACS token
    const { token, expiresOn } = await fetchChatUserToken(transactionId, userPsId);

    logInfo(
      `[${transactionId}] [fetchAcsCredentialsByUserPsId] ACS token and communicationUserId successfully retrieved for user: ${userPsId}`,
    );

    return {
      communicationUserId: azureSystem.vendorValue,
      token,
      expiresOn,
    };
  } catch (error) {
    logError(
      `[${transactionId}] [fetchAcsCredentialsByUserPsId] Error fetching ACS token and communicationUserId for user: ${userPsId}. Error: ${error.message}`,
    );
    throw error;
  }
};

const getChatGroupByGroupId = async (
  transactionId: string,
  groupId: string,
  branchId?: string,
): Promise<OBChatV2GroupSchemaType> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] [ChatV2] [getChatGroupByGroupId] finding chat group by groupId: ${groupId}`);

    const cachedGroup = await cacheService.retrieve(transactionId, {
      serviceName: 'chatV2Service',
      identifier: `chatGroup_${groupId}`,
    });

    if (cachedGroup) {
      return cachedGroup as OBChatV2GroupSchemaType;
    }

    const filter: FilterQuery<OBChatV2GroupSchemaType> = {};

    if (branchId) {
      filter.branchId = branchId;
    }

    const obChatGroup = await OBChatV2GroupModel.findOne({ groupId, ...filter }).lean();

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [getChatGroupByGroupId] Successfully get chat group by groupId: ${groupId}`,
    );

    if (!obChatGroup) {
      logError(
        `[${transactionId}] [SERVICE] [ChatV2] [getChatGroupByGroupId] No chat group found for groupId: ${groupId}`,
      );

      throw new Error(`No chat group found for groupId: ${groupId}`);
    }

    await cacheService.persist(transactionId, {
      serviceName: 'chatV2Service',
      identifier: `chatGroup_${groupId}`,
      data: obChatGroup,
      expires: '1m',
    });

    return obChatGroup;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [getChatGroupByGroupId] Error occurred during chat group finding. Details: ${error.message}`,
    );
    throw error;
  }
};

const splitChatUsersByRoleAndLimit = (
  obUsers: OBUserSchemaType[],
  maxAdminsPerChatGroup: number,
  maxUsersAllowedInChat: number,
): {
  limitedAdmins: OBUserSchemaType[];
  limitedFieldStaffs: OBUserSchemaType[];
  leftoverFieldStaffs: OBUserSchemaType[];
} => {
  // Separate admin staff
  const adminStaffs = obUsers.filter(
    (user) =>
      mapAccessLevelToName(user.obAccess.level) === UserLevelEnum.BRANCH_ADMIN &&
      user.activeStatus === UserStatusEnum.Active,
  );

  // Sort admins by job level (lowest number means highest priority)
  const sortedAdmins = adminStaffs.sort((adminA, adminB) => adminA.obAccess.level - adminB.obAccess.level);

  // Apply the admin limit
  const limitedAdmins = sortedAdmins.slice(0, maxAdminsPerChatGroup);

  // Separate field staff
  const fieldStaffs = obUsers.filter(
    (user) =>
      mapAccessLevelToName(user.obAccess.level) === UserLevelEnum.FIELD_STAFF &&
      user.activeStatus === UserStatusEnum.Active,
  );

  if (fieldStaffs.length === 0) {
    throw new Error('No field staff found. At least one Field Staff is required.');
  }

  // Calculate how many slots remain for field staff
  const remainingSlots = maxUsersAllowedInChat - limitedAdmins.length;
  const limitedFieldStaffs = fieldStaffs.slice(0, remainingSlots);
  const leftoverFieldStaffs = fieldStaffs.slice(remainingSlots);

  return {
    limitedAdmins,
    limitedFieldStaffs,
    leftoverFieldStaffs,
  };
};

const createObChatGroupUserRecord = async (
  transactionId: string,
  {
    employeePsId,
    vendorUserId,
    groupId,
    vendorGroupId,
    branchId,
    displayName,
    accessMode,
  }: {
    employeePsId: string;
    vendorUserId: string;
    groupId: string;
    vendorGroupId: string;
    branchId: string;
    displayName: string;
    accessMode: UserAccessModeEnum;
  },
): Promise<OBChatV2UserSchemaType> => {
  try {
    if (!vendorUserId) {
      throw new Error(`Missing vendorUserId for user ID: ${employeePsId}`);
    }

    const chatUser: OBChatV2UserSchemaType = {
      employeePsId,
      vendorUserId,
      groupId,
      vendorGroupId,
      branchId,
      employeeName: displayName,
      accessMode,
      activeStatus: UserStatusEnum.Active,
      muteNotifications: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const translatedChatUser = mapChatV2UserRequestToDBRecord(chatUser);

    const newObChatUser = new OBChatV2UserModel(translatedChatUser);
    const obChatUser = await newObChatUser.save();

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [createObChatGroupUserRecord] Created chat user psId: ${employeePsId}`,
    );

    return obChatUser;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [createObChatGroupUserRecord] Error occurred during user creation: ${error.message}`,
    );
    throw error;
  }
};

const addObChatGroupUserRecords = async (
  transactionId: string,
  groupId: string,
  insertObChatGroupUserRecords: {
    employeePsId: string;
    vendorUserId: string;
    groupId: string;
    vendorGroupId: string;
    branchId: string;
    displayName: string;
    accessMode: UserAccessModeEnum;
  }[],
  batchSize = 20,
): Promise<void> => {
  const insertBatches = chunkArray(insertObChatGroupUserRecords, batchSize);

  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] [addObChatGroupUserRecords] Batch Inserting ${insertObChatGroupUserRecords.length} records in batches of ${batchSize} for groupId: ${groupId}`,
  );

  for (const batch of insertBatches) {
    await Promise.all(batch.map((insertRecord) => createObChatGroupUserRecord(transactionId, insertRecord)));

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [addObChatGroupUserRecords] Inserted ${batch.length} records from the batch`,
    );
  }

  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] [addObChatGroupUserRecords] Batch Insert SUCCESSFUL for groupId: ${groupId}`,
  );
};

const createObChatGroupRecord = async (
  transactionId: string,
  {
    groupName,
    vendorGroupId,
    groupType,
    branchId,
    groupImage,
    groupCategory,
    accessControlMeta,
    metricsMeta,
    intendedForPsId,
    createdBy,
  }: {
    groupName: string;
    vendorGroupId: string;
    groupType: ChatGroupEnum;
    groupCategory?: string;
    branchId: string;
    groupImage?: { bucketName: string; uri: string };
    accessControlMeta: OBChatV2AccessControlMetaType;
    metricsMeta: OBChatV2MetricsMetaType;
    intendedForPsId?: string;
    createdBy: string;
  },
): Promise<OBChatV2GroupSchemaType> => {
  try {
    // Generate an internal group ID
    const nanoId = createNanoId(8);
    const chatGroupId = prefixChatGroupId(nanoId);

    // Build the group object
    const chatGroup: OBChatV2GroupSchemaType = {
      groupId: chatGroupId,
      vendorGroupId,
      groupName,
      groupType,
      groupCategory,
      branchId,
      intendedForPsId,
      groupImage,
      activeStatus: ChatGroupStatusEnum.Active,
      accessControlMeta: {
        maxUsersAllowed: accessControlMeta.maxUsersAllowed ?? chatConfig.maxUsersAllowedInChat,
        bidirectional: accessControlMeta.bidirectional ?? chatConfig.canFieldStaffReply,
        attachmentsAllowed: accessControlMeta.attachmentsAllowed ?? chatConfig.attachmentsAllowed,
        richTextSupported: accessControlMeta.richTextSupported ?? chatConfig.richTextSupported,
        captureActivities: accessControlMeta.captureActivities ?? chatConfig.captureActivities,
        notificationsPaused: accessControlMeta.notificationsPaused ?? chatConfig.notificationsPaused,
        notificationsPausedUntil: accessControlMeta.notificationsPausedUntil ?? null,
        availableOnWeekends: accessControlMeta.availableOnWeekends ?? chatConfig.availableOnWeekends,
        chatOpenHour: accessControlMeta.chatOpenHour ?? chatConfig.chatOpenHour,
        chatCloseHour: accessControlMeta.chatCloseHour ?? chatConfig.chatCloseHour,
      },
      metricsMeta: {
        totalActiveAdminCount: metricsMeta.totalActiveAdminCount,
        totalUserCount: metricsMeta.totalUserCount,
        totalActiveUserCount: metricsMeta.totalUserCount,
      },
      createdBy,
      createdByPsId: chatConfig.rootUserPsId,
      updatedAt: new Date(),
      createdAt: new Date(),
    };

    const translatedChatGroup = mapChatV2GroupRequestToDBRecord(chatGroup);
    const newObChatGroup = new OBChatV2GroupModel(translatedChatGroup);

    const obChatGroup = await newObChatGroup.save();

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [createObChatGroupRecord] Successfully saved chat groupName: ${groupName}, vendorGroupId: ${vendorGroupId}`,
    );

    if (groupType === ChatGroupEnum.DirectMessage) {
      logInfo(
        `[${transactionId}] [SERVICE] [ChatV2] [createObChatGroupRecord] Successfully created branch chat for psId: ${intendedForPsId}`,
      );
    }

    return obChatGroup.toJSON();
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] [ChatV2] [createObChatGroupRecord] Error: ${error.message}`);
    throw error;
  }
};

/**
 * @deprecated use createChatGroupForBranchWithParticipants instead
 */
const createChatGroupForBranch = async (
  transactionId: string,
  branchId: string,
  chatGroupData: {
    branchId: string;
    groupName: string;
    groupType: ChatGroupEnum;
    groupUserPsIds: string[];
    intendedForPsId?: string;
    groupCategory?: string;
    groupImage?: { bucketName: string; uri: string };
    canFieldStaffReply?: boolean;
    notificationsPaused?: boolean;
    notificationsPausedUntil?: Date;
    attachmentsAllowed?: boolean;
    richTextSupported?: boolean;
    captureActivities?: boolean;
    availableOnWeekends?: boolean;
    chatOpenHour?: number;
    chatCloseHour?: number;
    createdBy?: string;
  },
): Promise<OBChatV2GroupSchemaType> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [createChatGroupForBranch] Creating new chat group for branchId: ${branchId}`,
    );

    const { token: userToken, communicationUserId } = await fetchAcsCredentialsByUserPsId(
      transactionId,
      chatConfig.rootUserPsId,
    );

    // Find out participants by psIds
    const obChatUsers = await userService.getObUsersByPsIds(transactionId, chatGroupData.groupUserPsIds);

    const validObUsers: OBUserSchemaType[] = obChatUsers.filter((user) => {
      return user.vendorSystems?.some(({ vendorId }) => vendorId === VendorExternalEnum.Azure);
    });

    // Find invalid users
    const invalidObUsers: OBUserSchemaType[] = obChatUsers.filter((user) => {
      return !user.vendorSystems?.some(({ vendorId }) => vendorId === VendorExternalEnum.Azure);
    });

    if (invalidObUsers.length > 0) {
      logWarn(
        `[${transactionId}] [SERVICE] [ChatV2] [createChatGroupForBranch] Some users missing ACS ids for branchId: ${branchId}. Invalid psIds: ${invalidObUsers
          .map((invalidUser) => invalidUser.employeePsId)
          .join(',')}`,
      );
    }

    const { limitedAdmins, limitedFieldStaffs, leftoverFieldStaffs } = splitChatUsersByRoleAndLimit(
      validObUsers,
      chatConfig.maxAdminsPerChatGroup,
      chatConfig.maxUsersAllowedInChat,
    );

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [createChatGroupForBranch] Creating chat group with admins: ${limitedAdmins.length}, field staff: ${limitedFieldStaffs.length}`,
    );

    // TODO: Multiple Groups missing, If the maxUsersAllowedInChat limit is exceeded, create additional groups (e.g., Group B, Group C).
    // Each new group should contain the same admins but additional field staff.
    if (leftoverFieldStaffs.length) {
      logInfo(
        `[${transactionId}] [SERVICE] [ChatV2] [createChatGroupForBranch] Creating chat group with ${leftoverFieldStaffs.length} overflow field staff user(s).`,
      );
    }

    const groupUsers = [...limitedAdmins, ...limitedFieldStaffs];

    const participants: ChatGroupParticipantType[] = [];

    groupUsers.forEach((user) => {
      const azureVendorSystem = user.vendorSystems?.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);

      if (!azureVendorSystem?.vendorValue) {
        return;
      }

      participants.push({
        vendorUserId: azureVendorSystem?.vendorValue,
        displayName: user.displayName,
      });
    });

    const { chatThread: acsChatGroup }: CreateChatThreadResult = await createAcsChatGroup(
      transactionId,
      communicationUserId,
      userToken,
      chatGroupData.groupName,
      participants,
    );

    if (!acsChatGroup?.id) {
      throw new Error('Failed to create chat group in ACS. No chatThreadId returned.');
    }

    // IMPORTANT: This ACS id is the Chat Thread/Group Id generated in ACS vendor
    const vendorGroupId = acsChatGroup.id;

    const obChatGroup = await createObChatGroupRecord(transactionId, {
      groupName: chatGroupData.groupName,
      vendorGroupId,
      groupType: chatGroupData.groupType,
      branchId,
      groupCategory: chatGroupData.groupCategory,
      groupImage: chatGroupData.groupImage,
      intendedForPsId: chatGroupData.intendedForPsId,
      accessControlMeta: {
        maxUsersAllowed: chatConfig.maxUsersAllowedInChat,
        bidirectional: chatGroupData.canFieldStaffReply ?? chatConfig.canFieldStaffReply,
        attachmentsAllowed: chatGroupData.attachmentsAllowed ?? chatConfig.attachmentsAllowed,
        richTextSupported: chatGroupData.richTextSupported ?? chatConfig.richTextSupported,
        captureActivities: chatGroupData.captureActivities ?? chatConfig.captureActivities,
        notificationsPaused: chatGroupData.notificationsPaused ?? chatConfig.notificationsPaused,
        notificationsPausedUntil: chatGroupData.notificationsPausedUntil ?? null,
        chatOpenHour: chatGroupData.chatOpenHour ?? chatConfig.chatOpenHour,
        chatCloseHour: chatGroupData.chatCloseHour ?? chatConfig.chatCloseHour,
        availableOnWeekends: chatGroupData.availableOnWeekends ?? chatConfig.availableOnWeekends,
      },
      metricsMeta: {
        totalActiveAdminCount: limitedAdmins.length,
        totalUserCount: groupUsers.length,
        totalActiveUserCount: groupUsers.length,
      },
      createdBy: chatGroupData.createdBy ?? UserLevelEnum.BRANCH_ADMIN,
    });

    // TODO: To add batch processing to make sure the writes are not blocked
    await Promise.all(
      groupUsers.map(async (user) => {
        const azureVendorSystem = user.vendorSystems?.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);
        if (!azureVendorSystem) {
          return;
        }

        const accessMode =
          mapAccessLevelToName(getEffectiveJobRole(user.obAccess, user.job).level) === UserLevelEnum.BRANCH_ADMIN
            ? UserAccessModeEnum.Admin
            : UserAccessModeEnum.Agent;

        return createObChatGroupUserRecord(transactionId, {
          employeePsId: user.employeePsId,
          vendorUserId: azureVendorSystem.vendorValue,
          groupId: obChatGroup.groupId,
          vendorGroupId: obChatGroup.vendorGroupId,
          branchId: obChatGroup.branchId,
          displayName: user.displayName,
          accessMode,
        });
      }),
    );

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [createChatGroupForBranch] Successfully created chat group "${chatGroupData.groupName}" with vendor ID: ${vendorGroupId}`,
    );

    return obChatGroup;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [createChatGroupForBranch] Error occurred during chat group creation. Details: ${error.message}`,
    );
    throw error;
  }
};

const createChatGroupForBranchWithParticipants = async (
  transactionId: string,
  groupSettings: {
    branchId: string;
    groupType: ChatGroupEnum;
    groupName: string;
    groupCategory?: string;
    groupImage?: { bucketName: string; uri: string };
  },
  userSettings: { adminPsIds: string[]; fieldStaffPsIds: string[]; intendedForPsId?: string },
  groupMetaSettings: {
    canFieldStaffReply?: boolean;
    notificationsPaused?: boolean;
    notificationsPausedUntil?: Date;
    attachmentsAllowed?: boolean;
    richTextSupported?: boolean;
    captureActivities?: boolean;
    availableOnWeekends?: boolean;
    chatOpenHour?: number;
    chatCloseHour?: number;
    createdBy?: string;
  },
): Promise<OBChatV2GroupSchemaType> => {
  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] [createChatGroupForBranchWithParticipants] Creating chat group for branchId: ${
      groupSettings.branchId
    }, groupSettings: ${JSON.stringify(groupSettings)}, userSettings: ${JSON.stringify(
      userSettings,
    )}, groupMetaSettings: ${JSON.stringify(groupMetaSettings)}`,
  );

  const groupUserPsIds: string[] = [...userSettings.adminPsIds, ...userSettings.fieldStaffPsIds];

  if (userSettings.intendedForPsId) {
    groupUserPsIds.push(userSettings.intendedForPsId);
  }

  if (groupUserPsIds.length > 250) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [createChatGroupForBranchWithParticipants] ERROR cannot create group as the number of users exceeds the maximum limit of 250.`,
    );

    throw new Error('The number of users exceeds the maximum limit of 250.');
  }

  await syncChatUserAccessForBranch(transactionId, groupSettings.branchId);

  const [{ token: rootUserToken, communicationUserId: rootCommunicationUserId }, obUsers] = await Promise.all([
    fetchAcsCredentialsByUserPsId(transactionId, chatConfig.rootUserPsId),
    userService.getObUsersByPsIds(transactionId, groupUserPsIds, { activeOnly: true }),
  ]);

  const validObUsers: OBUserSchemaType[] = [];
  const invalidObUsers: OBUserSchemaType[] = [];
  const participants: ChatGroupParticipantType[] = [];

  obUsers.forEach((user) => {
    const azureVendorSystem = user.vendorSystems?.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);

    if (!azureVendorSystem) {
      invalidObUsers.push(user);

      return;
    }

    validObUsers.push(user);
    participants.push({
      displayName: user.displayName,
      vendorUserId: azureVendorSystem.vendorValue,
    });
  });

  if (invalidObUsers.length > 0) {
    logWarn(
      `[${transactionId}] [SERVICE] [ChatV2] [createChatGroupForBranchWithParticipants] Some users missing ACS ids for branchId: ${
        groupSettings.branchId
      }. Invalid psIds: ${invalidObUsers.map((invalidUser) => invalidUser.employeePsId).join(',')}`,
    );
  }

  const { chatThread: acsChatGroup }: CreateChatThreadResult = await createAcsChatGroup(
    transactionId,
    rootCommunicationUserId,
    rootUserToken,
    groupSettings.groupName,
    participants,
  );

  if (!acsChatGroup?.id) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [createChatGroupForBranchWithParticipants] Failed to create chat group in ACS. No chatThreadId returned for branchId: ${groupSettings.branchId}`,
    );

    throw new Error('Failed to create chat group in ACS. No chatThreadId returned.');
  }

  const vendorGroupId = acsChatGroup.id;

  const totalUserCount =
    userSettings.adminPsIds.length + userSettings.fieldStaffPsIds.length + (userSettings.intendedForPsId ? 1 : 0);

  const obChatGroup = await createObChatGroupRecord(transactionId, {
    groupName: groupSettings.groupName,
    vendorGroupId,
    groupType: groupSettings.groupType,
    branchId: groupSettings.branchId,
    groupCategory: groupSettings.groupCategory,
    groupImage: groupSettings.groupImage,
    intendedForPsId: userSettings.intendedForPsId,
    accessControlMeta: {
      maxUsersAllowed: chatConfig.maxUsersAllowedInChat,
      bidirectional: groupMetaSettings.canFieldStaffReply ?? chatConfig.canFieldStaffReply,
      attachmentsAllowed: groupMetaSettings.attachmentsAllowed ?? chatConfig.attachmentsAllowed,
      richTextSupported: groupMetaSettings.richTextSupported ?? chatConfig.richTextSupported,
      captureActivities: groupMetaSettings.captureActivities ?? chatConfig.captureActivities,
      notificationsPaused: groupMetaSettings.notificationsPaused ?? chatConfig.notificationsPaused,
      notificationsPausedUntil: groupMetaSettings.notificationsPausedUntil ?? null,
      chatOpenHour: groupMetaSettings.chatOpenHour ?? chatConfig.chatOpenHour,
      chatCloseHour: groupMetaSettings.chatCloseHour ?? chatConfig.chatCloseHour,
      availableOnWeekends: groupMetaSettings.availableOnWeekends ?? chatConfig.availableOnWeekends,
    },
    metricsMeta: {
      totalActiveAdminCount: userSettings.adminPsIds.length,
      totalUserCount,
      totalActiveUserCount: totalUserCount,
    },
    createdBy: groupMetaSettings.createdBy ?? UserLevelEnum.BRANCH_ADMIN,
  });

  await addObChatGroupUserRecords(
    transactionId,
    obChatGroup.groupId,
    validObUsers.map((user) => {
      return {
        employeePsId: user.employeePsId,
        vendorUserId: user.vendorSystems.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure).vendorValue,
        groupId: obChatGroup.groupId,
        vendorGroupId,
        branchId: groupSettings.branchId,
        displayName: user.displayName,
        accessMode:
          mapAccessLevelToName(getEffectiveJobRole(user.obAccess, user.job).level) === UserLevelEnum.BRANCH_ADMIN
            ? UserAccessModeEnum.Admin
            : UserAccessModeEnum.Agent,
      };
    }),
  );

  await updateChatGroupStats(transactionId, obChatGroup.groupId, groupSettings.branchId);

  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] [createChatGroupForBranch] Successfully created chat group for branchId: ${groupSettings.branchId}, groupType: ${groupSettings.groupType}`,
  );

  return getChatGroupByGroupId(transactionId, obChatGroup.groupId);
};

const updateChatGroup = async (
  transactionId: string,
  chatGroupPartialFields: Partial<OBChatV2GroupSchemaType>,
): Promise<OBChatV2GroupSchemaType> => {
  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] updateChatGroup - updating chat group for groupId: ${chatGroupPartialFields.groupId}`,
  );

  try {
    if (!chatGroupPartialFields.groupId) {
      throw new Error('Missing mandatory field "groupId" for update');
    }

    const translatedFields = mapChatV2GroupRequestToDBRecord(chatGroupPartialFields);

    const updatedChatGroup = await OBChatV2GroupModel.findOneAndUpdate(
      { groupId: translatedFields.groupId },
      {
        ...translatedFields,
        updatedAt: new Date(),
      },
      { new: true },
    );

    if (!updatedChatGroup) {
      throw new Error(`Chat group not found for groupId: ${chatGroupPartialFields.groupId}`);
    }

    await cacheService.remove(transactionId, {
      serviceName: 'chatV2Service',
      identifier: `chatGroup_${updatedChatGroup.groupId}`,
    });

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] updateChatGroup - SUCCESSFUL for groupId: ${updatedChatGroup.groupId}`,
    );

    return updatedChatGroup;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] updateChatGroup - FAILED for groupId: ${chatGroupPartialFields.groupId}, reason: ${updateErr.message}`,
    );

    throw updateErr;
  }
};

const updateChatGroupWithParticipants = async (
  transactionId: string,
  groupId: string,
  updateData: HttpPUTUpdateChatV2GroupInputType,
): Promise<OBChatV2GroupSchemaType> => {
  logInfo(`[${transactionId}] [SERVICE] updateChatGroupWithParticipants initiated for groupId: ${groupId}`);

  try {
    // Get existing group to verify it exists
    const existingGroup = await getChatGroupByGroupId(transactionId, groupId);
    if (!existingGroup) {
      throw new Error(`Chat group not found with id: ${groupId}`);
    }

    // Compare changes between existing and new data
    const existingGroupUsers = await getChatGroupUsers(transactionId, groupId, existingGroup.branchId);
    const existingGroupUsersPsIds = existingGroupUsers.map((user) => user.employeePsId);

    const { canUpdate, updateFields, addGroupUserPsIds, removeGroupUserPsIds, typesOfChangesDetected } =
      compareChatGroupChanges(existingGroup, existingGroupUsersPsIds, updateData);

    if (!canUpdate) {
      logWarn(`[${transactionId}] [CONTROLLER] updateChatV2Groups: No changes detected for groupId: ${groupId}`);

      throw new Error('No changes detected');
    }

    if (typesOfChangesDetected.includes('ParticipantChange')) {
      if (removeGroupUserPsIds.length > 0) {
        await removeParticipantsFromChatGroup(transactionId, groupId, removeGroupUserPsIds);
      }
      if (addGroupUserPsIds.length > 0) {
        await addParticipantsToChatGroupV2(transactionId, groupId, addGroupUserPsIds);
      }

      await updateChatGroupStats(transactionId, groupId, existingGroup.branchId);
    }

    // Update the group with new fields including metrics
    const updatedGroup = await updateChatGroup(transactionId, updateFields);

    return updatedGroup;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] updateChatGroupWithParticipants FAILED for groupId: ${groupId}, reason: ${error.message}`,
    );
    throw error;
  }
};

const getChatGroupsByFilter = async (
  transactionId: string,
  filters: FilterQuery<OBChatV2GroupSchemaType>,
  options: {
    limit?: number;
    skip?: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  } = {},
): Promise<OBChatV2GroupSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] getChatGroupsByFilter - find all chat groups by filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  try {
    const searchQuery: FilterQuery<OBChatV2GroupSchemaType> = {};
    if (options.search) {
      const searchRegex = new RegExp(options.search, 'i');
      searchQuery.$or = [{ groupId: searchRegex }, { groupName: searchRegex }];
    }

    const sortQuery: QueryOptions<OBChatV2GroupSchemaType> = {};
    if (options.sortField) {
      sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
    } else {
      sortQuery.createdAt = -1;
    }

    const query = {
      ...filters,
      ...searchQuery,
    };

    const cursor = OBChatV2GroupModel.find(query)
      .lean()
      .sort(sortQuery)
      .skip(options.skip ?? 0)
      .limit(options.limit ?? 100)
      .cursor();

    const chatGroups: OBChatV2GroupSchemaType[] = [];
    for await (const group of cursor) {
      chatGroups.push(group);
    }

    logInfo(
      `[${transactionId}] [SERVICE] getChatGroupsByFilter - total retrieved: ${
        chatGroups.length
      } for query: ${JSON.stringify(query)}`,
    );

    return chatGroups;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] getChatGroupsByFilter - FAILED. Reason: ${err.message}`);
    throw err;
  }
};

const removeChatGroupByGroupId = async (
  transactionId: string,
  groupId: string,
  forceDelete?: boolean,
): Promise<void> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [removeChatGroup] removing chat group by groupId: ${groupId}, force: ${forceDelete}`,
    );

    const obChatGroup = await OBChatV2GroupModel.findOne({ groupId });

    if (!obChatGroup) {
      throw new Error(`Chat group with groupId '${groupId}' not found.`);
    }

    const { vendorGroupId } = obChatGroup;
    const { token, communicationUserId } = await fetchAcsCredentialsByUserPsId(transactionId, chatConfig.rootUserPsId);

    await removeAcsChatGroup(transactionId, communicationUserId, token, vendorGroupId);

    if (forceDelete) {
      // Hard Delete
      const [{ deletedCount }] = await Promise.all([
        OBChatV2GroupModel.deleteOne({ groupId }),
        OBChatV2UserModel.deleteMany({ groupId, branchId: obChatGroup.branchId, activeStatus: ActiveStateEnum.Active }),
      ]);

      logInfo(
        `[${transactionId}] [SERVICE] removeChatGroup - Hard Removing chat group SUCCESSFUL for groupId: ${groupId}, deletedCount: ${deletedCount}`,
      );
    } else {
      // Soft Delete
      await Promise.all([
        OBChatV2GroupModel.findOneAndUpdate(
          { groupId },
          { activeStatus: ChatGroupStatusEnum.Archived, updatedAt: new Date() },
          { new: true },
        ),
        OBChatV2UserModel.updateMany(
          { groupId, branchId: obChatGroup.branchId, activeStatus: ActiveStateEnum.Active },
          { activeStatus: ActiveStateEnum.Inactive, updatedAt: new Date() },
        ),
      ]);

      logInfo(
        `[${transactionId}] [SERVICE] removeChatGroup - Soft Removing chat group SUCCESSFUL for groupId: ${groupId}`,
      );
    }

    await cacheService.remove(transactionId, {
      serviceName: 'chatV2Service',
      identifier: `chatGroup_${groupId}`,
    });
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [removeChatGroup] Error occurred during chat group removing. Details: ${error.message}`,
    );
    throw error;
  }
};

const getChatGroupsByBranchIds = async (
  transactionId: string,
  branchIds: string[],
  groupTypes?: ChatGroupEnum[],
  {
    activeOnly,
    skip,
    limit,
    sortField,
    sortOrder,
  }: { activeOnly?: boolean; skip?: number; limit?: number; sortField?: string; sortOrder?: 'asc' | 'desc' } = {
    activeOnly: true,
    skip: 0,
    limit: 1000,
  },
): Promise<OBChatV2GroupSchemaType[]> => {
  try {
    const additionalFilters: FilterQuery<OBChatV2GroupSchemaType> = {};

    if (groupTypes) {
      additionalFilters.groupType = { $in: groupTypes };
    }

    if (activeOnly) {
      additionalFilters.activeStatus = ChatGroupStatusEnum.Active;
    }

    const chatGroups = await getChatGroupsByFilter(
      transactionId,
      {
        branchId: { $in: branchIds },
        ...additionalFilters,
      },
      {
        skip,
        limit,
        sortField,
        sortOrder,
      },
    );

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [getChatGroupsByBranchIds] Successfully fetched chat groups for branchIds: ${branchIds}, total: ${chatGroups.length}`,
    );

    return chatGroups;
  } catch (fetchErr) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [getChatGroupsByBranchIds] Error occurred during chat group fetching, reason: ${fetchErr.message}`,
    );

    throw fetchErr;
  }
};

const getChatGroupUsers = async (
  transactionId: string,
  groupId: string,
  branchId: string,
  { activeOnly } = { activeOnly: true },
): Promise<OBChatV2UserSchemaType[]> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] [ChatV2] getChatGroupUsers - Fetching chat group users`);

    const filters: FilterQuery<OBChatV2UserSchemaType> = {
      branchId,
      groupId,
    };

    if (activeOnly) {
      filters.activeStatus = ActiveStateEnum.Active;
    }

    const users = await OBChatV2UserModel.find(filters).skip(0).limit(500).lean();

    logInfo(`[${transactionId}] [SERVICE] [ChatV2] getChatGroupUsers - ${users.length} users fetched`);

    return users;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] [ChatV2] getChatGroupUsers - FAILED. Error: ${err.message}`);

    throw err;
  }
};

const getChatGroupVendorUsers = async (
  transactionId: string,
  vendorGroupId: string,
): Promise<
  {
    vendorUserId: string;
    displayName: string;
    shareHistoryTime?: Date;
  }[]
> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] getChatGroupVendorUsers - Fetching chat group users from Vendor initiated for vendorGroupId: ${vendorGroupId}`,
    );

    const { token, communicationUserId } = await fetchAcsCredentialsByUserPsId(transactionId, chatConfig.rootUserPsId);

    const vendorUserList = await listAcsChatGroupParticipants(transactionId, vendorGroupId, communicationUserId, token);

    if (!vendorUserList) {
      throw new Error(`No vendor users found for vendorGroupId: ${vendorGroupId}`);
    }

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] getChatGroupVendorUsers - Fetching chat group users from Vendor initiated for vendorGroupId: ${vendorGroupId}`,
    );

    const mappedVendorUsers = vendorUserList.map((vendorUser) => ({
      vendorUserId: (vendorUser.id as CommunicationUserIdentifier)?.communicationUserId,
      displayName: vendorUser.displayName,
      shareHistoryTime: vendorUser.shareHistoryTime ? new Date(vendorUser.shareHistoryTime) : undefined,
    }));

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] getChatGroupVendorUsers SUCCESSFUL for vendorGroupId: ${vendorGroupId}, user count: ${mappedVendorUsers.length}`,
    );

    return mappedVendorUsers;
  } catch (fetchErr) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [getChatGroupVendorUsers] Error occurred during chat group fetching, reason: ${fetchErr.message}`,
    );

    throw fetchErr;
  }
};

const getChatVendorGroupUsers = async (
  transactionId: string,
  groupId: string,
  branchId?: string,
): Promise<(OBChatV2UserSchemaType & { isUserPresentInVendor: boolean })[]> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] [ChatV2] getChatVendorGroupUsers - Fetching chat group users`);

    const currentGroup = await getChatGroupByGroupId(transactionId, groupId, branchId);

    if (!currentGroup) {
      throw new Error(`Chat group with groupId '${groupId}' not found.`);
    }

    const vendorUserList = await getChatGroupVendorUsers(transactionId, currentGroup.vendorGroupId);

    const filters: FilterQuery<OBChatV2UserSchemaType> = {
      branchId,
      groupId,
    };

    const users = await OBChatV2UserModel.find(filters).skip(0).limit(500).lean();

    const vendorUserSet = new Set(vendorUserList.map((vendorUser) => vendorUser.vendorUserId));

    logInfo(`[${transactionId}] [SERVICE] [ChatV2] getChatVendorGroupUsers - ${users.length} users fetched`);

    return users.map((user) => ({
      ...user,
      isUserPresentInVendor: vendorUserSet.has(user.vendorUserId),
    }));
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] [ChatV2] getChatVendorGroupUsers - FAILED. Error: ${err.message}`);

    throw err;
  }
};

const getChatUserAccessByBranchAndPsId = async (
  transactionId: string,
  psId: string,
  branchId: string,
  { activeOnly, groupTypes } = { activeOnly: true, groupTypes: [ChatGroupEnum.DirectMessage] },
  { skip, limit } = { skip: 0, limit: 500 },
): Promise<OBChatV2UserSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] [getChatUserAccessByBranchAndPsId] - Fetching chat group users by filter`,
  );

  try {
    const query: FilterQuery<OBChatV2UserSchemaType> = {
      employeePsId: psId,
      branchId,
      groupType: { $in: groupTypes },
    };

    if (activeOnly) {
      query.activeStatus = ActiveStateEnum.Active;
    }

    const users = await OBChatV2UserModel.find(query).skip(skip).limit(limit).lean();

    logInfo(`[${transactionId}] [SERVICE] [getChatUserAccessByBranchAndPsId] - ${users.length} users fetched`);

    return users;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] [getChatUserAccessByBranchAndPsId] - FAILED. Error: ${err.message}`);

    throw err;
  }
};

const updateChatGroupStats = async (transactionId: string, groupId: string, branchId: string) => {
  const currentGroupUserState = await getChatGroupUsers(transactionId, groupId, branchId);

  const stats = {
    totalUserCount: currentGroupUserState.length,
    adminCount: 0,
    fieldStaffCount: 0,
  };

  currentGroupUserState.forEach((groupUser) => {
    if (groupUser.accessMode === UserAccessModeEnum.Agent) {
      stats.fieldStaffCount += 1;

      return;
    }

    stats.adminCount += 1;
  });

  await OBChatV2GroupModel.updateOne(
    { groupId },
    {
      $set: {
        metricsMeta: {
          totalActiveAdminCount: stats.adminCount,
          totalUserCount: stats.totalUserCount,
          totalActiveUserCount: stats.totalUserCount,
        },
      },
    },
  );

  await cacheService.remove(transactionId, {
    serviceName: 'chatV2Service',
    identifier: `chatGroup_${groupId}`,
  });

  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroupV2] Successfully updated metrics for groupId: ${groupId}`,
  );
};

const addParticipantsToChatGroupV2 = async (
  transactionId: string,
  groupId: string,
  addGroupUserPsIds: string[],
): Promise<string[]> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroupV2] Initiated for group ID: ${groupId}, psIds: ${addGroupUserPsIds.join(
        ',',
      )}`,
    );

    if (addGroupUserPsIds.length === 0) {
      return [];
    }

    const chatGroup = await getChatGroupByGroupId(transactionId, groupId);

    if (!chatGroup?.groupId) {
      throw new Error(`Chat group with groupId '${groupId}' not found.`);
    }

    // TODO: Move 250 as part of config
    if (chatGroup.metricsMeta.totalUserCount + addGroupUserPsIds.length > 250) {
      throw new Error('Chat group cannot accommodate more than 250 users');
    }

    const { token: userToken, communicationUserId } = await fetchAcsCredentialsByUserPsId(
      transactionId,
      chatConfig.rootUserPsId,
    );

    // Find out participants by psIds
    const obUsers = await userService.getObUsersByPsIds(transactionId, addGroupUserPsIds);
    const validObUsers: OBUserSchemaType[] = [];
    const acsParticipants: ChatGroupParticipantType[] = [];

    obUsers.forEach((user) => {
      const azureVendorSystem = user.vendorSystems?.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);

      if (azureVendorSystem?.vendorValue) {
        validObUsers.push(user);
        acsParticipants.push({ vendorUserId: azureVendorSystem.vendorValue, displayName: user.displayName });
      }
    });

    // Call the vendor function to add participants
    const addedVendorUserIds = await addAcsChatGroupParticipants(
      transactionId,
      chatGroup.vendorGroupId,
      {
        rootCommunicationUserId: communicationUserId,
        rootUserToken: userToken,
      },
      acsParticipants,
    );

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroup], Group ID: ${groupId}, Added: ${addedVendorUserIds.length}`,
    );

    const chatGroupInserts: {
      employeePsId: string;
      vendorUserId: string;
      groupId: string;
      vendorGroupId: string;
      branchId: string;
      displayName: string;
      accessMode: UserAccessModeEnum;
    }[] = [];

    for (const validObUser of validObUsers) {
      const azureVendorSystem = validObUser.vendorSystems.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);
      const isUserAdded = addedVendorUserIds.some(
        (participant) => participant.vendorUserId === azureVendorSystem?.vendorValue,
      );

      if (!isUserAdded) {
        continue;
      }

      const accessMode =
        mapAccessLevelToName(getEffectiveJobRole(validObUser.obAccess, validObUser.job).level) ===
        UserLevelEnum.BRANCH_ADMIN
          ? UserAccessModeEnum.Admin
          : UserAccessModeEnum.Agent;

      chatGroupInserts.push({
        employeePsId: validObUser.employeePsId,
        vendorUserId: azureVendorSystem.vendorValue,
        groupId: chatGroup.groupId,
        vendorGroupId: chatGroup.vendorGroupId,
        branchId: chatGroup.branchId,
        displayName: validObUser.displayName,
        accessMode,
      });
    }

    // Confirm users are actually added in the ACS system
    const updatedAcsParticipants = await listAcsChatGroupParticipants(
      transactionId,
      chatGroup.vendorGroupId,
      communicationUserId,
      userToken,
    );

    const updatedVendorUserIdSet = new Set(
      updatedAcsParticipants.map((participant) => (participant.id as CommunicationUserIdentifier).communicationUserId),
    );

    const confirmedChatGroupInserts = chatGroupInserts.filter((insert) =>
      updatedVendorUserIdSet.has(insert.vendorUserId),
    );

    if (confirmedChatGroupInserts.length > 0) {
      await addObChatGroupUserRecords(transactionId, chatGroup.groupId, confirmedChatGroupInserts);
      logInfo(
        `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroup] Successfully created ${confirmedChatGroupInserts.length} chat group users for ACS chat group ID: ${groupId}`,
      );
    } else {
      logWarn(
        `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroup] No confirmed users in ACS group, skipped DB insert.`,
      );
    }

    return confirmedChatGroupInserts.map((item) => item.employeePsId);
  } catch (addErr) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroupV2] Error adding participants to groupId: ${groupId}, reason: ${addErr.message}`,
    );

    throw addErr;
  }
};

// TODO: Refactor this function and compare it with addParticipantsToChatGroupV2.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const addParticipantsToChatGroup = async (
  transactionId: string,
  groupId: string,
  addGroupUserPsIds: string[],
): Promise<void> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroup] Adding participants to ACS chat group ID: ${groupId}`,
    );

    if (!Array.isArray(addGroupUserPsIds) || addGroupUserPsIds.length === 0) {
      throw new Error('No participants provided to add.');
    }

    const chatGroup = await getChatGroupByGroupId(transactionId, groupId);

    if (!chatGroup?.groupId) {
      throw new Error(`Chat group with groupId '${groupId}' not found.`);
    }

    const { token: userToken, communicationUserId } = await fetchAcsCredentialsByUserPsId(
      transactionId,
      chatConfig.rootUserPsId,
    );

    // Find out participants by psIds
    const obChatUsers = await userService.getObUsersByPsIds(transactionId, addGroupUserPsIds);

    const validObUsers: OBUserSchemaType[] = [];
    const invalidObUserPsIds: string[] = [];
    obChatUsers.forEach((user) => {
      if (user.vendorSystems?.some(({ vendorId }) => vendorId === VendorExternalEnum.Azure)) {
        validObUsers.push(user);
      } else {
        invalidObUserPsIds.push(user.employeePsId);
      }
    });

    if (invalidObUserPsIds.length > 0) {
      logWarn(
        `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroup] Some users missing ACS IDs for groupId: ${groupId}. Invalid psIds: ${invalidObUserPsIds.join(
          ',',
        )}`,
      );
    }

    const { limitedAdmins, limitedFieldStaffs, leftoverFieldStaffs } = splitChatUsersByRoleAndLimit(
      validObUsers,
      chatConfig.maxAdminsPerChatGroup - chatGroup.metricsMeta.totalActiveAdminCount,
      chatConfig.maxUsersAllowedInChat - chatGroup.metricsMeta.totalActiveUserCount,
    );

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroup] Creating chat group with admins: ${limitedAdmins.length}, field staff: ${limitedFieldStaffs.length}`,
    );

    // TODO: Multiple Groups missing, If the maxUsersAllowedInChat limit is exceeded, create additional groups (e.g., Group B, Group C).
    // Each new group should contain the same admins but additional field staff.
    if (leftoverFieldStaffs.length) {
      logInfo(
        `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroup] Creating chat group with ${leftoverFieldStaffs.length} overflow field staff user(s).`,
      );
    }

    const groupUsers = [...limitedAdmins, ...limitedFieldStaffs];

    const participants: ChatGroupParticipantType[] = [];

    groupUsers.forEach((user) => {
      const azureVendorSystem = user.vendorSystems?.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);
      if (azureVendorSystem?.vendorValue) {
        participants.push({ vendorUserId: azureVendorSystem.vendorValue, displayName: user.displayName });
      }
    });

    // Call the vendor function to add participants
    await addAcsChatGroupParticipants(
      transactionId,
      chatGroup.vendorGroupId,
      {
        rootCommunicationUserId: communicationUserId,
        rootUserToken: userToken,
      },
      participants,
    );

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroup] Successfully added participants to ACS chat group ID: ${groupId}`,
    );

    // TODO: To add batch processing to make sure the writes are not blocked
    await Promise.all(
      groupUsers.map(async (user) => {
        const azureVendorSystem = user.vendorSystems?.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);
        if (!azureVendorSystem) {
          return;
        }

        const accessMode =
          mapAccessLevelToName(getEffectiveJobRole(user.obAccess, user.job).level) === UserLevelEnum.BRANCH_ADMIN
            ? UserAccessModeEnum.Admin
            : UserAccessModeEnum.Agent;

        return createObChatGroupUserRecord(transactionId, {
          employeePsId: user.employeePsId,
          vendorUserId: azureVendorSystem.vendorValue,
          groupId: chatGroup.groupId,
          vendorGroupId: chatGroup.vendorGroupId,
          branchId: chatGroup.branchId,
          displayName: user.displayName,
          accessMode,
        });
      }),
    );

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroup] Successfully create chat group users for ACS chat group ID: ${groupId}`,
    );
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [addParticipantsToChatGroup] Error while adding participants to ACS chat group ID: ${groupId}. Details: ${error.message}`,
    );
    throw error;
  }
};

const removeParticipantsFromChatGroup = async (
  transactionId: string,
  groupId: string,
  removeGroupUserPsIds: string[],
): Promise<void> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [removeParticipantsFromChatGroup] Removing participants from ACS chat group ID: ${groupId}`,
    );

    if (!Array.isArray(removeGroupUserPsIds) || removeGroupUserPsIds.length === 0) {
      throw new Error('No participants provided to remove.');
    }

    const chatGroup = await getChatGroupByGroupId(transactionId, groupId);
    if (!chatGroup?.groupId) {
      throw new Error(`Chat group with groupId '${groupId}' not found.`);
    }

    const { token: userToken, communicationUserId } = await fetchAcsCredentialsByUserPsId(
      transactionId,
      chatConfig.rootUserPsId,
    );

    const obUsers = await userService.getObUsersByPsIds(transactionId, removeGroupUserPsIds);
    const userMap: Record<string, string> = {};
    const vendorUserIdsToRemove: string[] = [];

    obUsers.forEach((user) => {
      const azureSystem = user.vendorSystems?.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);
      if (azureSystem?.vendorValue) {
        vendorUserIdsToRemove.push(azureSystem.vendorValue);
        userMap[azureSystem.vendorValue] = user.employeePsId;
      }
    });

    if (vendorUserIdsToRemove.length === 0) {
      throw new Error('No valid Azure users found to remove.');
    }

    const removedVendorUserIds = await removeAcsChatGroupParticipants(
      transactionId,
      chatGroup.vendorGroupId,
      communicationUserId,
      userToken,
      vendorUserIdsToRemove,
    );

    const updatedAcsParticipants = await listAcsChatGroupParticipants(
      transactionId,
      chatGroup.vendorGroupId,
      communicationUserId,
      userToken,
    );

    const remainingVendorUserIdSet = new Set(
      updatedAcsParticipants.map((participant) => (participant.id as CommunicationUserIdentifier).communicationUserId),
    );

    const safeToDeletePsIds: string[] = [];

    for (const vendorUserId of removedVendorUserIds) {
      if (!remainingVendorUserIdSet.has(vendorUserId)) {
        if (userMap[vendorUserId]) {
          safeToDeletePsIds.push(userMap[vendorUserId]);
        }
      }
    }

    if (safeToDeletePsIds.length > 0) {
      await OBChatV2UserModel.deleteMany({
        employeePsId: { $in: safeToDeletePsIds },
        groupId,
      });
    } else {
      logInfo(
        `[${transactionId}] [SERVICE] [ChatV2] [removeParticipantsFromChatGroup] No valid participants removed from ACS, skipping...`,
      );
    }

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [removeParticipantsFromChatGroup] Safely removed ${safeToDeletePsIds.length} users from system.`,
    );
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [removeParticipantsFromChatGroup]  Error while removing participants from ACS chat group ID: ${groupId}. Details: ${error.message}`,
    );

    throw error;
  }
};

const resetChatUserProfile = async (transactionId: string, userPsId: string): Promise<string> => {
  try {
    const obUser = await userService.getObUsersByPsId(transactionId, userPsId);

    const acsVendor = obUser.vendorSystems.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);

    if (acsVendor) {
      await removeAcsUser(transactionId, acsVendor.vendorValue).catch(() => null);
    }

    if (
      ![UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN].includes(
        mapAccessLevelToName(getEffectiveJobRole(obUser.obAccess, obUser.job).level),
      )
    ) {
      throw new Error('User chat profile cannot be reset!');
    }

    await createChatProfileForUser(transactionId, userPsId);

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [resetChatUserProfile] Chat profile reset SUCCESSFULLY for psId: ${userPsId}`,
    );

    return userPsId;
  } catch (resetErr) {
    logError(`[${transactionId}] [SERVICE] getChatGroupById FAILED, reason: ${resetErr.message}`);

    throw resetErr;
  }
};

/**
 * @description Upload small file, for large file use initiateLargeAttachmentForChat
 */
const attachSmallAttachmentForChat = async (
  transactionId: string,
  file: Express.Multer.File,
  fileName: string,
): Promise<{
  fileIdentifier: string;
  signedUrl: string;
}> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] [ChatV2] attachSmallAttachmentForChat - Processing file: ${fileName}`);

    const fileIdentifier = `chat_attachments/${fileName}`;

    await uploadFileToS3(transactionId, {
      content: file.buffer,
      fileName: fileIdentifier,
    });

    const presignedUrl = await createPresignedUrlWithClient(transactionId, fileIdentifier);

    return {
      fileIdentifier,
      signedUrl: presignedUrl,
    };
  } catch (attachErr) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] attachSmallAttachmentForChat - FAILED. Error: ${attachErr.message}`,
    );

    throw attachErr;
  }
};

const initiateLargeAttachmentForChat = async (
  transactionId: string,
  fileName: string,
  partsCount: number,
): Promise<{
  fileIdentifier: string;
  signedUrls: string[];
  uploadId: string;
}> => {
  logInfo(`[${transactionId}] [SERVICE] [ChatV2] [initiateLargeAttachmentForChat] Processing file: ${fileName}`);

  const { fileIdentifier, signedUrls, uploadId } = await initiateMultipartUpload(
    transactionId,
    `chat_attachments/${fileName}`,
    partsCount,
  );

  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] [initiateLargeAttachmentForChat] Init Successful for file: ${fileIdentifier}, uploadId: ${uploadId}`,
  );

  return {
    fileIdentifier,
    signedUrls,
    uploadId,
  };
};

const finalizeLargeAttachmentForChat = async (
  transactionId: string,
  fileIdentifier: string,
  {
    uploadId,
    uploadedParts,
  }: {
    uploadId: string;
    uploadedParts: { etag: string; partNumber: number }[];
  },
): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] [ChatV2] [finalizeLargeAttachmentForChat] Processing file: ${fileIdentifier}`);

  const attachedUrl = await completeMultipartUpload(transactionId, uploadId, fileIdentifier, uploadedParts);

  logInfo(`[${transactionId}] [SERVICE] [ChatV2] [finalizeLargeAttachmentForChat] Processing file: ${fileIdentifier}`);

  return attachedUrl;
};

const getAttachmentUrlForChat = async (transactionId: string, fileIdentifier: string): Promise<string> => {
  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] [getAttachmentUrl] Get signed url for file identifier: ${fileIdentifier}`,
  );

  try {
    const presignedUrl = await createPresignedUrlWithClient(transactionId, fileIdentifier);

    return presignedUrl;
  } catch (getAttachmentUrl) {
    logError(`[${transactionId}] [SERVICE] [ChatV2] [getAttachmentUrl] Error: ${getAttachmentUrl.message}`);

    throw getAttachmentUrl;
  }
};

const syncChatUserAccessForBranch = async (txId: string, branchId: string): Promise<void> => {
  logInfo(
    `[${txId}] [SERVICE] [ChatV2] [syncChatUserAccessForBranch] Syncing chat user access for branchId: ${branchId}`,
  );

  try {
    // fetch all chat users by branchId with job level filters [1, 2, 3, 4, 5]
    let activeUsers: OBUserSchemaType[] = [];
    let hasMoreUsers = true;
    let skip = 0;
    const limit = 600;
    const maxLimit = 2000;

    while (hasMoreUsers || skip < maxLimit) {
      const users = await userService.getObUsersByBranchIds(txId, [branchId], [1, 2, 3, 4, 5], {
        skip,
        activeOnly: true,
        limit,
      });

      activeUsers = activeUsers.concat(users);
      skip += limit;

      if (users.length < limit) {
        hasMoreUsers = false;
      }
    }

    logInfo(
      `[${txId}] [SERVICE] [ChatV2] [syncChatUserAccessForBranch] Fetched ${activeUsers.length} active users for branchId: ${branchId}`,
    );

    const updatePromises: Promise<{
      userPsId: string;
      chatUserId: string;
    }>[] = [];

    activeUsers.forEach((user) => {
      const azureVendorSystem = user.vendorSystems?.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);

      if (azureVendorSystem?.vendorValue) {
        return;
      }

      logInfo(
        `[${txId}] [SERVICE] [ChatV2] [syncChatUserAccessForBranch] Creating ACS id for psId: ${user.employeePsId}`,
      );

      updatePromises.push(createChatProfileForUser(txId, user.employeePsId));
    });

    if (updatePromises.length === 0) {
      logInfo(
        `[${txId}] [SERVICE] [ChatV2] [syncChatUserAccessForBranch] All active users are enrolled in ACS for branchId: ${branchId} for user count: ${activeUsers.length}`,
      );

      return;
    }

    const batchPromises = chunkArray(updatePromises, 20);

    for (const batch of batchPromises) {
      const results = await Promise.allSettled(batch);

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logError(
            `[${txId}] [SERVICE] [ChatV2] Error processing user ${activeUsers[index].employeePsId}: ${result.reason}`,
          );
        }
      });
    }

    logInfo(`[${txId}] [SERVICE] [ChatV2] Completed chat user sync for branchId: ${branchId}`);
  } catch (error) {
    logError(
      `[${txId}] [SERVICE] [ChatV2] [syncChatUserAccessForBranch] Error: ${error.message} for branchId: ${branchId}`,
    );
  }
};

const getBranchContacts = async (
  transactionId: string,
  branchIds: string[],
  { skip, limit } = { skip: 0, limit: 1000 },
): Promise<
  {
    groupId?: string;
    groupName?: string;
    userPsId: string;
    intendedForPsId?: string;
    branchIds: string[];
    jobId: string;
    jobLevel: number;
    jobTitle: string;
    role: UserAccessModeEnum;
    displayName?: string;
    userEmail: string;
    lastLoggedAt?: string;
  }[]
> => {
  try {
    const [obUsers, fieldStaffChatGroups] = await Promise.all([
      userService.getObUsersByBranchIds(transactionId, branchIds, [1, 2, 3, 4, 5], {
        skip,
        limit,
        activeOnly: true,
      }),
      getChatGroupsByBranchIds(transactionId, branchIds, [ChatGroupEnum.DirectMessage], {
        activeOnly: true,
        skip,
        limit,
      }),
    ]);

    const contacts: {
      groupId?: string;
      groupName?: string;
      userPsId: string;
      intendedForPsId?: string;
      branchIds: string[];
      jobId: string;
      jobLevel: number;
      jobTitle: string;
      role: UserAccessModeEnum;
      displayName?: string;
      userEmail: string;
      lastLoggedAt?: string;
    }[] = [];

    const fieldStaffGroupMap = new Map<string, OBChatV2GroupSchemaType>();

    fieldStaffChatGroups.forEach((chatGroup) => {
      if (!chatGroup.intendedForPsId || !branchIds.includes(chatGroup.branchId)) {
        return;
      }

      fieldStaffGroupMap.set(chatGroup.intendedForPsId, chatGroup);
    });

    obUsers.forEach((obUser) => {
      const directMessageGroup = fieldStaffGroupMap.get(obUser.employeePsId);
      let chatRole: UserAccessModeEnum = null;

      if (!obUser.vendorSystems?.some(({ vendorId }) => vendorId === VendorExternalEnum.Azure)) {
        return;
      }

      const currentUserJob = getEffectiveJobRole(obUser.obAccess, obUser.job);
      const currentBranchIds = getEffectiveBranchIds(
        obUser.branchAccess.overriddenBranchIds,
        obUser.branchAccess.selectedBranchIds,
      );

      switch (mapAccessLevelToName(currentUserJob.level)) {
        case UserLevelEnum.FIELD_STAFF:
          chatRole = UserAccessModeEnum.Agent;
          break;
        // TODO Add other roles when required
        default:
          chatRole = UserAccessModeEnum.Admin;
      }

      if (chatRole === UserAccessModeEnum.Agent && !directMessageGroup) {
        logWarn(
          `[${transactionId}] [SERVICE] [ChatV2] [getBranchContacts] Missing DirectMessage group for branchIds: ${currentBranchIds.join(
            ',',
          )}, psId: ${obUser.employeePsId}`,
        );

        return;
      }

      contacts.push({
        groupId: directMessageGroup?.groupId,
        groupName: directMessageGroup ? obUser.displayName ?? directMessageGroup.groupName : undefined,
        branchIds: currentBranchIds,
        role: chatRole,
        jobId: currentUserJob.jobId,
        jobLevel: currentUserJob.level,
        jobTitle: currentUserJob.title,
        displayName: obUser.displayName,
        userEmail: obUser.workEmail,
        userPsId: obUser.employeePsId,
        intendedForPsId: obUser.employeePsId,
        lastLoggedAt: obUser.lastLoggedAt ? new Date(obUser.lastLoggedAt).toISOString() : undefined,
      });
    });

    return contacts;
  } catch (contactErr) {
    logError(`[${transactionId}] [SERVICE] [ChatV2] [getBranchContacts] Error: ${contactErr.message}`);

    throw contactErr;
  }
};

const expectedSetupForFieldStaff = async (transactionId: string, userPsId: string, branchId: string) => {
  const branchAdmins = await userService.getObUsersByBranchIds(transactionId, [branchId], [2, 3, 4, 5], {
    limit: 249,
    activeOnly: true,
    sortField: 'createdAt',
    sortOrder: 'asc', // This will maintain the user list in predictable order
  });

  const expectedAdminPsIds: string[] = [];

  branchAdmins.forEach((admin) => {
    const azureVendorSystem = admin.vendorSystems.find(({ vendorId }) => vendorId === VendorExternalEnum.Azure);

    if (!azureVendorSystem) {
      return;
    }

    expectedAdminPsIds.push(admin.employeePsId);
  });

  return {
    adminPsIds: expectedAdminPsIds,
    intendedUserPsId: userPsId,
  };
};

const currentSetupForFieldStaff = async (
  transactionId: string,
  userPsId: string,
  branchId: string,
): Promise<{
  activeChatGroup?: OBChatV2GroupSchemaType;
  staleChatGroups: OBChatV2GroupSchemaType[];
  adminPsIds: string[];
  intendedUserPsId: string;
}> => {
  const allChatGroups = await getChatGroupsByFilter(
    transactionId,
    {
      branchId,
      groupType: ChatGroupEnum.DirectMessage,
      activeStatus: { $in: [ChatGroupStatusEnum.Active] },
      intendedForPsId: userPsId,
    },
    {
      sortField: 'createdAt',
      sortOrder: 'asc', // This will maintain the user list in predictable order
    },
  );

  const [validChatGroup, ...extraGroups] = allChatGroups;

  if (!validChatGroup) {
    return {
      staleChatGroups: extraGroups,
      adminPsIds: [],
      intendedUserPsId: userPsId,
    };
  }

  const [chatGroupUsers, vendorGroupUsers] = await Promise.all([
    getChatGroupUsers(transactionId, validChatGroup.groupId, branchId),
    getChatGroupVendorUsers(transactionId, validChatGroup.vendorGroupId),
  ]);

  const vendorGroupUserSet = new Set(vendorGroupUsers.map((vendorUser) => vendorUser.vendorUserId));

  const currentAdminPsIds: string[] = [];
  const missingInVendorPsIds: string[] = [];

  chatGroupUsers.forEach((groupUser) => {
    if (!vendorGroupUserSet.has(groupUser.vendorUserId)) {
      missingInVendorPsIds.push(groupUser.employeePsId);
    }

    if (groupUser.employeePsId === userPsId) {
      return;
    }

    currentAdminPsIds.push(groupUser.employeePsId);
  });

  if (missingInVendorPsIds.length > 0) {
    logWarn(
      `[${transactionId}] [SERVICE] [ChatV2] [currentSetupForFieldStaff] [SERIOUS WARNING] Missing vendor group users for psId: ${missingInVendorPsIds.join(
        ',',
      )} in groupId: ${validChatGroup.groupId} in branchId: ${validChatGroup.branchId}`,
    );
  }

  if (chatGroupUsers.length !== vendorGroupUsers.length) {
    logWarn(
      `[${transactionId}] [SERVICE] [ChatV2] [currentSetupForFieldStaff] [SERIOUS WARNING] system group users and vendor group users mismatch in groupId: ${validChatGroup.groupId} in branchId: ${validChatGroup.branchId}, system users: ${chatGroupUsers.length}, vendor users: ${vendorGroupUsers.length}`,
    );
  }

  return {
    activeChatGroup: validChatGroup,
    staleChatGroups: extraGroups,
    adminPsIds: currentAdminPsIds,
    intendedUserPsId: userPsId,
  };
};

const syncBranchChatAbility = async (transactionId: string, userPsId: string, branchId: string): Promise<void> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [syncBranchChatAbility] Syncing Branch Chat initiated for psId: ${userPsId}, branchId: ${branchId}`,
    );

    const currentUser = await userService.getObUsersByPsId(transactionId, userPsId);

    const currentJob = getEffectiveJobRole(currentUser.obAccess, currentUser.job);

    const currentJobAccess = mapAccessLevelToName(currentJob.level);

    const currentBranchIds = getEffectiveBranchIds(
      currentUser.branchAccess.overriddenBranchIds,
      currentUser.branchAccess.selectedBranchIds,
    );

    if (![UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN].includes(currentJobAccess)) {
      logInfo(
        `[${transactionId}] [SERVICE] [ChatV2] [syncBranchChatAbility] ignoring the user psId: ${userPsId} as direct chat not required`,
      );

      return;
    }

    if (!currentBranchIds.includes(branchId)) {
      logInfo(
        `[${transactionId}] [SERVICE] [ChatV2] [syncBranchChatAbility] ignoring the user psId: ${userPsId} as not part of branchId: ${branchId}`,
      );

      return;
    }

    if (currentJobAccess === UserLevelEnum.BRANCH_ADMIN) {
      const staleGroups = await getChatGroupsByFilter(transactionId, {
        branchId,
        groupType: ChatGroupEnum.DirectMessage,
        activeStatus: { $in: [ChatGroupStatusEnum.Active] },
        intendedForPsId: userPsId,
      });

      if (staleGroups.length > 0) {
        await Promise.all(
          staleGroups.map((staleGroup) =>
            updateChatGroup(transactionId, {
              groupId: staleGroup.groupId,
              branchId: staleGroup.branchId,
              activeStatus: ChatGroupStatusEnum.Inactive,
            }),
          ),
        );

        logInfo(
          `[${transactionId}] [SERVICE] [ChatV2] [syncBranchChatAbility] Deactivated stale chat groups since admin for psId: ${userPsId}, branchId: ${branchId}`,
        );
      }

      const [expectedAdminGroups, currentAdminGroups] = await Promise.all([
        getChatGroupsByFilter(
          transactionId,
          {
            branchId,
            groupType: ChatGroupEnum.DirectMessage,
            activeStatus: { $in: [ChatGroupStatusEnum.Active] },
            intendedForPsId: { $ne: userPsId },
          },
          {
            skip: 0,
            limit: 4000,
          },
        ),
        getChatUserAccessByBranchAndPsId(
          transactionId,
          userPsId,
          branchId,
          {
            activeOnly: true,
            groupTypes: [ChatGroupEnum.DirectMessage],
          },
          {
            skip: 0,
            limit: 4000,
          },
        ),
      ]);

      const currentAdminGroupIdSet = new Set(currentAdminGroups.map((group) => group.groupId));

      const adminMissingInGroupIds: string[] = [];

      expectedAdminGroups.forEach((expectedGroup) => {
        if (currentAdminGroupIdSet.has(expectedGroup.groupId)) {
          return;
        }

        adminMissingInGroupIds.push(expectedGroup.groupId);
      });

      if (adminMissingInGroupIds.length > 0) {
        logWarn(
          `[${transactionId}] [SERVICE] [ChatV2] [syncBranchChatAbility] Missing adminPsId: ${userPsId}, branchId: ${branchId}, missing groupIds: ${adminMissingInGroupIds.join()}`,
        );

        await Promise.all(
          adminMissingInGroupIds.map((missingGroupId) =>
            addParticipantsToChatGroupV2(transactionId, missingGroupId, [userPsId]).then(() =>
              updateChatGroupStats(transactionId, missingGroupId, branchId),
            ),
          ),
        );

        logInfo(
          `[${transactionId}] [SERVICE] [ChatV2] [syncBranchChatAbility] Admin adminPsId: ${userPsId} added to missing groupIds: ${adminMissingInGroupIds.join(
            ',',
          )} for branchId: ${branchId}`,
        );
      }

      return;
    }

    // Below code is only for field staff

    const [currentState, expectedState] = await Promise.all([
      currentSetupForFieldStaff(transactionId, userPsId, branchId),
      expectedSetupForFieldStaff(transactionId, userPsId, branchId),
    ]);

    if (currentState.staleChatGroups.length > 0) {
      /**
       * Hard delete the chat groups which are not required due to duplication issues
       */
      await Promise.all(
        currentState.staleChatGroups.map((staleGroup) =>
          removeChatGroupByGroupId(transactionId, staleGroup.groupId, true),
        ),
      );

      logInfo(
        `[${transactionId}] [SERVICE] [ChatV2] [syncBranchChatAbility] Removed stale chat groups for psId: ${userPsId}, branchId: ${branchId}`,
      );
    }

    let currentActiveGroup = currentState.activeChatGroup;

    if (!currentState.activeChatGroup) {
      const [recentInactiveGroup] = await getChatGroupsByFilter(transactionId, {
        branchId,
        groupType: ChatGroupEnum.DirectMessage,
        activeStatus: { $in: [ChatGroupStatusEnum.Inactive] },
        intendedForPsId: userPsId,
      });

      if (!recentInactiveGroup) {
        const createdGroup = await createChatGroupForBranch(transactionId, branchId, {
          branchId,
          groupName: currentUser.displayName,
          groupType: ChatGroupEnum.DirectMessage,
          intendedForPsId: currentUser.employeePsId,
          groupUserPsIds: [currentUser.employeePsId, ...expectedState.adminPsIds],
          attachmentsAllowed: true, // TODO: use config
          canFieldStaffReply: true, // TODO: use config
        });

        logInfo(
          `[${transactionId}] [SERVICE] [ChatV2] [syncBranchChatAbility] Created new direct message chat group for psId: ${userPsId}, branchId: ${branchId}, groupId: ${createdGroup.groupId}`,
        );

        return;
      }

      currentActiveGroup = recentInactiveGroup;

      await updateChatGroup(transactionId, {
        groupId: currentActiveGroup.groupId,
        activeStatus: ChatGroupStatusEnum.Active,
      });
    }

    const areAdminsMatching = compareLists(currentState.adminPsIds, expectedState.adminPsIds);

    if (areAdminsMatching) {
      logInfo(
        `[${transactionId}] [SERVICE] [ChatV2] [syncBranchChatAbility] Direct Message chat group HEALTHY for psId: ${userPsId}, branchId: ${branchId}, groupId: ${currentState.activeChatGroup.groupId}`,
      );

      return;
    }

    const expectedAdminPsIdMap = new Map<string, boolean>();
    const currentAdminPsIdMap = new Map<string, boolean>();

    expectedState.adminPsIds.forEach((adminPsId) => {
      expectedAdminPsIdMap.set(adminPsId, true);
    });
    currentState.adminPsIds.forEach((adminPsId) => {
      currentAdminPsIdMap.set(adminPsId, true);
    });

    const addPsIdsToGroup: string[] = [];
    const removePsIdsFromGroup: string[] = [];

    currentState.adminPsIds.forEach((adminPsId) => {
      if (!expectedAdminPsIdMap.has(adminPsId)) {
        removePsIdsFromGroup.push(adminPsId);
      }
    });

    expectedState.adminPsIds.forEach((adminPsId) => {
      if (!currentAdminPsIdMap.has(adminPsId)) {
        addPsIdsToGroup.push(adminPsId);
      }
    });

    if (removePsIdsFromGroup.length > 0) {
      await removeParticipantsFromChatGroup(transactionId, currentActiveGroup.groupId, removePsIdsFromGroup);
    }

    if (addPsIdsToGroup.length > 0) {
      await addParticipantsToChatGroupV2(transactionId, currentActiveGroup.groupId, addPsIdsToGroup);
    }

    await updateChatGroupStats(transactionId, currentActiveGroup.groupId, branchId);

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [syncBranchChatAbility] Sync completed for psId: ${userPsId}, branchId: ${branchId}, groupId: ${currentState.activeChatGroup.groupId}`,
    );
  } catch (syncErr) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [syncBranchChatAbility] Error occurred during chat group syncing. Details: ${syncErr.message}`,
    );
  }
};

const syncSystemChatGroupsForBranch = async (transactionId: string, branchId: string): Promise<void> => {
  try {
    for (const systemGroup of chatConfig.systemGroups) {
      const [expectationResult, currentResult] = await Promise.allSettled([
        getExpectedSystemGroup(transactionId, branchId, systemGroup.categoryIdentifier),
        getCurrentSystemGroup(transactionId, branchId, systemGroup.categoryIdentifier),
      ]);

      if (expectationResult.status === 'rejected') {
        logError(
          `[${transactionId}] [SERVICE] [ChatV2] [syncSystemChatGroupsForBranch] Error occurred while fetching expected system group: ${expectationResult.reason}`,
        );

        throw new Error(`Failed to fetch expected system group: ${expectationResult.reason}`);
      }

      const expectedSystemGroupSetup = expectationResult.value;

      if (currentResult.status === 'rejected') {
        logWarn(
          `[${transactionId}] [SERVICE] [ChatV2] [syncSystemChatGroupsForBranch] Error occurred while fetching current system group: ${currentResult.reason}`,
        );

        const createdGroup = await createChatGroupForBranchWithParticipants(
          transactionId,
          {
            branchId,
            groupName: expectedSystemGroupSetup.groupName,
            groupType: ChatGroupEnum.Broadcast,
            groupCategory: systemGroup.categoryIdentifier,
          },
          {
            adminPsIds: expectedSystemGroupSetup.adminPsIds,
            fieldStaffPsIds: expectedSystemGroupSetup.fieldStaffPsIds,
          },
          {
            canFieldStaffReply: chatConfig.canFieldStaffReply,
            notificationsPaused: chatConfig.notificationsPaused,
            attachmentsAllowed: chatConfig.attachmentsAllowed,
            richTextSupported: chatConfig.richTextSupported,
            captureActivities: chatConfig.captureActivities,
            availableOnWeekends: chatConfig.availableOnWeekends,
            chatOpenHour: chatConfig.chatOpenHour,
            chatCloseHour: chatConfig.chatCloseHour,
            createdBy: 'System',
          },
        );

        logInfo(
          `[${transactionId}] [SERVICE] [ChatV2] [syncSystemChatGroupsForBranch] Created new system chat group created for branchId: ${branchId}, groupCategory: ${systemGroup.categoryIdentifier} with groupId: ${createdGroup.groupId}`,
        );

        break;
      }

      const currentSystemGroupSetup = currentResult.value;

      if (currentSystemGroupSetup.groupStatus === ChatGroupStatusEnum.Inactive) {
        logWarn(
          `[${transactionId}] [SERVICE] [ChatV2] [syncSystemChatGroupsForBranch] System group is inactive: ${currentSystemGroupSetup.groupId} for branchId: ${branchId}, groupCategory: ${systemGroup.categoryIdentifier}`,
        );

        throw new Error(`System group is inactive for ${currentSystemGroupSetup.groupName}`);
      }

      const expectedPsIds = [...expectedSystemGroupSetup.adminPsIds, ...expectedSystemGroupSetup.fieldStaffPsIds];
      const currentPsIds = [...currentSystemGroupSetup.adminPsIds, ...currentSystemGroupSetup.fieldStaffPsIds];

      const missingPsIds: string[] = [];
      const ineligiblePsIds: string[] = [];

      const expectedPsIdSet = new Set(expectedPsIds);
      const currentPsIdSet = new Set(currentPsIds);

      currentPsIds.forEach((currentPsId) => {
        if (!expectedPsIdSet.has(currentPsId)) {
          ineligiblePsIds.push(currentPsId);

          return;
        }
      });

      expectedPsIds.forEach((expectedPsId) => {
        if (!currentPsIdSet.has(expectedPsId)) {
          missingPsIds.push(expectedPsId);

          return;
        }
      });

      if (missingPsIds.length === 0 && ineligiblePsIds.length === 0) {
        logInfo(
          `[${transactionId}] [SERVICE] [ChatV2] [syncSystemChatGroupsForBranch] System group is healthy for branchId: ${branchId}, groupCategory: ${systemGroup.categoryIdentifier}`,
        );

        break;
      }

      if (ineligiblePsIds.length > 0) {
        await removeParticipantsFromChatGroup(transactionId, currentSystemGroupSetup.groupId, ineligiblePsIds);

        logInfo(
          `[${transactionId}] [SERVICE] [ChatV2] [syncSystemChatGroupsForBranch] Removed ineligible participants from system group for branchId: ${branchId}, groupCategory: ${
            systemGroup.categoryIdentifier
          }, groupId: ${currentSystemGroupSetup.groupId}, removedPsIds: ${ineligiblePsIds.join(',')}`,
        );
      }

      if (missingPsIds.length > 0) {
        await addParticipantsToChatGroupV2(transactionId, currentSystemGroupSetup.groupId, missingPsIds);

        logInfo(
          `[${transactionId}] [SERVICE] [ChatV2] [syncSystemChatGroupsForBranch] Added missing participants to system group for branchId: ${branchId}, groupCategory: ${
            systemGroup.categoryIdentifier
          }, groupId: ${currentSystemGroupSetup.groupId}, addedPsIds: ${missingPsIds.join(',')}`,
        );
      }

      await updateChatGroupStats(transactionId, currentSystemGroupSetup.groupId, branchId);

      logInfo(
        `[${transactionId}] [SERVICE] [ChatV2] [syncSystemChatGroupsForBranch] Sync completed for system group for branchId: ${branchId}, groupCategory: ${systemGroup.categoryIdentifier}, groupId: ${currentSystemGroupSetup.groupId}`,
      );
    }
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [syncSystemChatGroupsForBranch] Error occurred while syncing system chat groups for branchId: ${branchId}, reason: ${error.message}`,
    );

    // Silent fail
  }
};

const findMessageReadStatusByGroupIds = async (
  transactionId: string,
  groupIds: string[],
  userPsId: string,
): Promise<
  {
    groupId: string;
    messageId: string;
    messageStatus: 'MessageSent' | 'MessageRead';
  }[]
> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [findMessageReadStatusByGroupIds] Fetching message read status for groupIds: ${groupIds.join(
        ',',
      )}`,
    );

    const lastReadMessageIds = await Promise.all(
      groupIds.map((groupId) =>
        cacheService.retrieveFromHash(transactionId, {
          serviceName: 'chatService',
          identifier: `chatGroup_${groupId}`,
          field: userPsId,
        }),
      ),
    );

    const lastReadMessageMap = new Map<
      string,
      {
        groupId: string;
        messageId: string;
        messageStatus: 'MessageSent' | 'MessageRead';
      }
    >();

    groupIds.forEach((groupId, index) => {
      if (!lastReadMessageIds[index]) {
        return;
      }

      lastReadMessageMap.set(groupId, {
        groupId,
        messageId: lastReadMessageIds[index],
        messageStatus: 'MessageRead',
      });
    });

    return [...lastReadMessageMap.values()];
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [findMessageReadStatusByGroupIds] Fetching message read status FAILED for groupIds: ${groupIds.join(
        ',',
      )}, reason: ${error.message}`,
    );

    return [];
  }
};

const recordMessageActivityInChatGroup = async (
  transactionId: string,
  chatGroupId: string,
  actionType: 'MessageSent' | 'MessageRead',
  { messageId, message, userPsId }: { messageId?: string; message?: string; userPsId: string },
): Promise<void> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [recordMessageActivityInChatGroup] message record triggered in chat groupId: ${chatGroupId}`,
    );

    if (actionType === 'MessageRead') {
      logInfo(
        `[${transactionId}] [SERVICE] [ChatV2] [recordMessageActivityInChatGroup] message read event triggered for groupId: ${chatGroupId}`,
      );

      await cacheService.hashPersist(transactionId, {
        serviceName: 'chatService',
        identifier: `chatGroup_${chatGroupId}`,
        field: userPsId,
        data: messageId,
        expires: '60d',
      });

      return;
    }

    await OBChatV2GroupModel.updateOne(
      { groupId: chatGroupId },
      {
        $set: {
          lastMessageActivity: {
            messageId,
            message,
            messageStatus: 'Sent',
            timestamp: new Date(),
          },
        },
      },
    );

    logInfo(`[${transactionId}] [SERVICE] [ChatV2] [recordMessageActivityInChatGroup] message recorded SUCCESSFULLY`);
  } catch (recordErr) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [recordMessageActivityInChatGroup] message record Error: ${recordErr.message}`,
    );

    throw recordErr;
  }
};

const getChatGroupsByUserAndBranches = async (
  transactionId: string,
  {
    userPsId,
    branchIds,
  }: {
    userPsId: string;
    branchIds: string[];
  },
  {
    status,
    fromDate,
  }: {
    status: ChatGroupStatusEnum;
    fromDate?: Date;
  } = {
    status: ChatGroupStatusEnum.Active,
  },
): Promise<OBChatV2GroupSchemaType[]> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [getChatGroupsByUserAndBranches] Fetching chat groups for user: ${userPsId}, branches: ${branchIds.join(
        ',',
      )}`,
    );

    const filters: FilterQuery<OBChatV2GroupSchemaType> = {
      employeePsId: userPsId,
      branchId: { $in: branchIds },
      activeStatus: status,
    };

    if (fromDate) {
      filters.updatedAt = {
        $gte: fromDate,
      };
    }

    const userChatGroups = await OBChatV2UserModel.find(filters).lean();

    const groupIds = userChatGroups.map((group) => group.groupId);
    logInfo(`[${transactionId}] [SERVICE] [ChatV2] [getChatGroupsByUserAndBranches] User chat groups: ${groupIds}`);

    return getChatGroupsByFilter(
      transactionId,
      {
        groupId: { $in: groupIds },
        branchId: { $in: branchIds },
        activeStatus: status,
      },
      {
        limit: 1000,
      },
    );
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] [ChatV2] [getChatGroupsByUserAndBranches] Error occurred: ${error.message}`);
    throw error;
  }
};

const getAllChatGroupsByUser = async (
  transactionId: string,
  userPsId: string,
): Promise<{ activeGroups: OBChatV2GroupSchemaType[]; inactiveGroups: OBChatV2GroupSchemaType[] }> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] [getAllChatGroupsByUser] Group listing initiated for psId: ${userPsId}`);

    const obUser = await userService.getObUsersByPsId(transactionId, userPsId);

    if (!obUser) {
      throw new Error('User not found in the system');
    }

    const currentUserAccess = mapAccessLevelToName(getEffectiveJobRole(obUser.obAccess, obUser.job).level);

    if (![UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN].includes(currentUserAccess)) {
      logWarn(
        `[${transactionId}] [SERVICE] [getAllChatGroupsByUser] Groups cannot be listed for wrong role for psId: ${userPsId}`,
      );

      return {
        activeGroups: [],
        inactiveGroups: [],
      };
    }

    const isFieldStaff = currentUserAccess === UserLevelEnum.FIELD_STAFF;
    const currentBranchIds = getEffectiveBranchIds(
      obUser.branchAccess.overriddenBranchIds,
      obUser.branchAccess.selectedBranchIds,
    );

    const activeInGroups = await getChatGroupsByUserAndBranches(transactionId, {
      userPsId,
      branchIds: currentBranchIds,
    });

    const activeAvailableGroups: OBChatV2GroupSchemaType[] = [];

    // TODO Find a smarter and faster way to get this value
    const recentlyDeactivatedGroups: OBChatV2GroupSchemaType[] = [];

    if (!isFieldStaff) {
      const activeFieldStaffs = await userService.getObUsersByBranchIds(transactionId, currentBranchIds, [1], {
        activeOnly: true,
        skip: 0,
        limit: 8000,
      });

      const currentActiveFieldStaffMap = new Map<string, OBUserSchemaType>();

      activeFieldStaffs.forEach((activeFieldStaff) => {
        currentActiveFieldStaffMap.set(activeFieldStaff.employeePsId, activeFieldStaff);
      });

      for (const activeGroup of activeInGroups) {
        if (activeGroup.intendedForPsId === userPsId && activeGroup.groupType === ChatGroupEnum.DirectMessage) {
          await updateChatGroup(transactionId, {
            groupId: activeGroup.groupId,
            branchId: activeGroup.branchId,
            activeStatus: ChatGroupStatusEnum.Inactive,
          });

          logInfo(
            `[${transactionId}] [SERVICE] [getAllChatGroupsByUser] Deactivated direct chat for admin psId: ${userPsId}, branchId: ${activeGroup.branchId}, groupId: ${activeGroup.groupId}`,
          );

          continue;
        }

        const fieldStaff = currentActiveFieldStaffMap.get(activeGroup.intendedForPsId);

        /**
         * This may be required if a genuine use case is needed
         */
        if (
          (activeGroup.groupType === ChatGroupEnum.DirectMessage && !fieldStaff) ||
          !currentBranchIds.includes(activeGroup.branchId)
        ) {
          logWarn(
            `[${transactionId}] [SERVICE] [getAllChatGroupsByUser] Removing irrelevant groups for admin psId: ${userPsId}, branchId: ${activeGroup.branchId}, groupId: ${activeGroup.groupId}`,
          );

          continue;
        }

        if (fieldStaff) {
          const [fieldStaffEffectiveBranchId] = getEffectiveBranchIds(
            fieldStaff.branchAccess.overriddenBranchIds,
            fieldStaff.branchAccess.selectedBranchIds,
          );

          if (fieldStaffEffectiveBranchId !== activeGroup.branchId) {
            logWarn(
              `[${transactionId}] [SERVICE] [getAllChatGroupsByUser] invalid placement of psId: ${userPsId}, branchIds: ${activeGroup.branchId}, groupId: ${activeGroup.groupId}`,
            );

            continue;
          }
        }

        activeAvailableGroups.push(activeGroup);
      }

      logInfo(
        `[${transactionId}] [SERVICE] [getAllChatGroupsByUser] Chat Groups found SUCCESSFULLY for admin psId: ${userPsId}, branchId: ${currentBranchIds.join(
          ',',
        )}, groupCount: ${activeAvailableGroups.length}`,
      );

      return {
        activeGroups: activeAvailableGroups,
        inactiveGroups: recentlyDeactivatedGroups,
      };
    }

    // Below is for field staff only

    const [primaryBranchId] = currentBranchIds;

    for (const activeGroup of activeInGroups) {
      if (activeGroup.groupType === ChatGroupEnum.DirectMessage && activeGroup.intendedForPsId !== userPsId) {
        logWarn(
          `[${transactionId}] [SERVICE] [getAllChatGroupsByUser] invalid placement of psId: ${userPsId}, branchIds: ${activeGroup.branchId}, groupId: ${activeGroup.groupId}`,
        );

        continue;
      }

      if (primaryBranchId !== activeGroup.branchId) {
        logWarn(
          `[${transactionId}] [SERVICE] [getAllChatGroupsByUser] Removing irrelevant groups for admin psId: ${userPsId}, branchId: ${activeGroup.branchId}, groupId: ${activeGroup.groupId}`,
        );

        continue;
      }

      if (activeGroup.groupType === ChatGroupEnum.DirectMessage && activeGroup.intendedForPsId === userPsId) {
        const branchDetail = await locationService.getBranchDetailsById(transactionId, activeGroup.branchId);

        // Rename the group name to branch name for field staff understanding
        activeGroup.groupName = `${branchDetail.branchName}`; // TODO Add a naming method if required
      }

      activeAvailableGroups.push(activeGroup);
    }

    logInfo(
      `[${transactionId}] [SERVICE] [getAllChatGroupsByUser] Chat Groups found SUCCESSFULLY for field staff psId: ${userPsId}, branchId: ${currentBranchIds.join(
        ',',
      )}, groupCount: ${activeAvailableGroups.length}`,
    );

    return {
      activeGroups: activeAvailableGroups,
      inactiveGroups: recentlyDeactivatedGroups,
    };
  } catch (fetchErr) {
    logError(
      `[${transactionId}] [SERVICE] [getAllChatGroupsByUser] Failed for psId: ${userPsId}, reason: ${fetchErr.message}`,
    );

    throw fetchErr;
  }
};

const getExpectedSystemGroup = async (
  transactionId: string,
  branchId: string,
  categoryIdentifier: string,
): Promise<{
  groupName: string;
  groupCategory: string;
  groupConfig: OBChatV2AccessControlMetaType;
  fieldStaffPsIds: string[];
  adminPsIds: string[];
  inactivePsIds: string[];
}> => {
  try {
    // Get system group config from chatConfig
    const systemGroupConfig = chatConfig.systemGroups.find((group) => group.categoryIdentifier === categoryIdentifier);

    if (!systemGroupConfig) {
      throw new Error(`System group configuration not found for category: ${categoryIdentifier}`);
    }

    const [branchUsers, branchInfo] = await Promise.all([
      userService.getObUsersByBranchIds(transactionId, [branchId], [1, 2, 3, 4, 5], {
        skip: 0,
        activeOnly: true,
        limit: 251, // HARD LIMIT to avoid,
      }),
      locationService.getBranchDetailsById(transactionId, branchId),
    ]);

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [getExpectedSystemGroup] Fetched ${branchUsers.length} users for branchId: ${branchId}`,
    );

    if (!branchInfo) {
      logError(
        `[${transactionId}] [SERVICE] [ChatV2] [getExpectedSystemGroup] Branch not found for branchId: ${branchId}`,
      );

      throw new Error(`Branch not found for branchId: ${branchId}`);
    }

    if (branchUsers.length > 250) {
      logError(
        `[${transactionId}] [SERVICE] [ChatV2] [getExpectedSystemGroup] Cannot create system groups for branchId: ${branchId} with ${branchUsers.length} due to exceeding user limit of 250 members`,
      );

      throw new Error('Cannot create system groups due to exceeding user limit of 250');
    }

    const adminPsIds: string[] = [];
    const fieldStaffPsIds: string[] = [];
    const allowedJobIds = new Set<string>();

    if (systemGroupConfig.categoryIdentifier) {
      (await jobService.getAllJobs(transactionId)).forEach((job) => {
        if (job.jobCategories?.includes(systemGroupConfig.jobCategory as JobCategoryEnum)) {
          allowedJobIds.add(job.jobId);
        }
      });
    }

    branchUsers.forEach((branchUser) => {
      const currentUserJob = getEffectiveJobRole(branchUser.obAccess, branchUser.job);
      const currentAccessName = mapAccessLevelToName(currentUserJob.level);

      if (![UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN].includes(currentAccessName)) {
        return;
      }

      if (currentAccessName === UserLevelEnum.BRANCH_ADMIN) {
        adminPsIds.push(branchUser.employeePsId);

        return;
      }

      if (systemGroupConfig.jobCategory && !allowedJobIds.has(currentUserJob.jobId)) {
        return;
      }

      fieldStaffPsIds.push(branchUser.employeePsId);
    });

    // TODO Move the below line to a naming mapper util
    const expectedGroupName = `${systemGroupConfig.groupName} (${branchInfo.branchName.slice(0, 30)})`;
    const expectedGroupConfigs = {
      maxUsersAllowed: chatConfig.maxUsersAllowedInChat,
      bidirectional: chatConfig.canFieldStaffReply,
      attachmentsAllowed: chatConfig.attachmentsAllowed,
      richTextSupported: chatConfig.richTextSupported,
      captureActivities: chatConfig.captureActivities,
      notificationsPaused: chatConfig.notificationsPaused,
      chatOpenHour: chatConfig.chatOpenHour,
      chatCloseHour: chatConfig.chatCloseHour,
      availableOnWeekends: chatConfig.availableOnWeekends,
    };

    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [getExpectedSystemGroup] Expected group name: ${expectedGroupName}, total user count: ${
        adminPsIds.length + fieldStaffPsIds.length
      }, group configs: ${JSON.stringify(expectedGroupConfigs)}, adminPsIds: ${adminPsIds.join(
        ',',
      )}, field staff psIds: ${fieldStaffPsIds.join(',')}`,
    );

    return {
      groupName: expectedGroupName,
      groupCategory: systemGroupConfig.categoryIdentifier,
      groupConfig: expectedGroupConfigs,
      fieldStaffPsIds,
      adminPsIds,
      inactivePsIds: [],
    };
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [getExpectedSystemGroup] Error getting ideal state for branchId: ${branchId}, category: ${categoryIdentifier}: ${error.message}`,
    );

    throw error;
  }
};

const getCurrentSystemGroup = async (
  transactionId: string,
  branchId: string,
  categoryIdentifier: string,
): Promise<{
  groupId: string;
  groupName: string;
  groupCategory: string;
  groupStatus: ChatGroupStatusEnum;
  groupConfig: OBChatV2AccessControlMetaType;
  fieldStaffPsIds: string[];
  adminPsIds: string[];
  inactivePsIds: string[];
}> => {
  const existingSystemGroups = await getChatGroupsByBranchIds(transactionId, [branchId], [ChatGroupEnum.Broadcast]);

  const systemGroup = existingSystemGroups.find(
    (group) => group.groupCategory === categoryIdentifier && group.branchId === branchId,
  );

  if (!systemGroup) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [getCurrentSystemGroup] System group not available for branchId: ${branchId}, categoryIdentifier: ${categoryIdentifier}}`,
    );

    throw new Error(`System group not available for branchId: ${branchId}, categoryIdentifier: ${categoryIdentifier}`);
  }

  const groupUsers = await getChatGroupUsers(transactionId, systemGroup.groupId, branchId);

  const adminPsIds: string[] = [];
  const fieldStaffPsIds: string[] = [];

  const inactivePsIds: string[] = [];

  groupUsers.forEach((groupUser) => {
    if (groupUser.activeStatus === UserStatusEnum.Inactive) {
      inactivePsIds.push(groupUser.employeePsId);

      return;
    }

    if (groupUser.accessMode === UserAccessModeEnum.Agent) {
      fieldStaffPsIds.push(groupUser.employeePsId);

      return;
    }

    adminPsIds.push(groupUser.employeePsId);
  });

  const currentGroupConfigs = {
    maxUsersAllowed: systemGroup.accessControlMeta.maxUsersAllowed,
    bidirectional: systemGroup.accessControlMeta.bidirectional,
    attachmentsAllowed: systemGroup.accessControlMeta.attachmentsAllowed,
    richTextSupported: systemGroup.accessControlMeta.richTextSupported,
    captureActivities: systemGroup.accessControlMeta.captureActivities,
    notificationsPaused: systemGroup.accessControlMeta.notificationsPaused,
    chatOpenHour: systemGroup.accessControlMeta.chatOpenHour,
    chatCloseHour: systemGroup.accessControlMeta.chatCloseHour,
    availableOnWeekends: systemGroup.accessControlMeta.availableOnWeekends,
  };

  const currentGroupName = systemGroup.groupName;

  logInfo(
    `[${transactionId}] [SERVICE] [ChatV2] [getCurrentSystemGroup] Current group name: ${currentGroupName}, current total user count: ${
      adminPsIds.length + fieldStaffPsIds.length
    }, group config: ${JSON.stringify(currentGroupConfigs)}, adminPsIds: ${adminPsIds.join(
      ',',
    )}, field staff psIds: ${fieldStaffPsIds.join(',')} and inactive psIds: ${inactivePsIds.join(',')}`,
  );

  return {
    groupId: systemGroup.groupId,
    groupName: currentGroupName,
    groupCategory: systemGroup.groupCategory,
    groupStatus: systemGroup.activeStatus,
    groupConfig: currentGroupConfigs,
    fieldStaffPsIds,
    adminPsIds,
    inactivePsIds,
  };
};

const isEligibleForNewChatVendor = async (transactionId: string, userPsId: string): Promise<boolean> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] [ChatV2] [isEligibleForNewChatVendor] Checking eligibility for new vendor for psId: ${userPsId}`,
    );
    const user = await userService.getObUsersByPsId(transactionId, userPsId);

    if (
      ![UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN].includes(
        mapAccessLevelToName(getEffectiveJobRole(user.obAccess, user.job).level),
      )
    ) {
      return false;
    }

    const [primaryBranchId] = getEffectiveBranchIds(
      user.branchAccess.overriddenBranchIds,
      user.branchAccess.selectedBranchIds,
    );

    return featureProvisioningService.getProvisionForBranchId(
      transactionId,
      BranchFeaturesProvisionEnum.ChatV2,
      primaryBranchId,
    );
  } catch (err) {
    logError(
      `[${transactionId}] [SERVICE] [ChatV2] [isEligibleForNewChatVendor] Error checking eligibility for new vendor: ${err.message}`,
    );

    return false;
  }
};

export {
  // Setters
  createNewChatUser,
  createChatGroupForBranch,
  updateChatGroupWithParticipants,
  recordMessageActivityInChatGroup,
  removeChatGroupByGroupId,
  resetChatUserProfile,

  // Getters
  fetchChatUserToken,
  getChatGroupByGroupId,
  getChatGroupsByBranchIds,
  getBranchContacts,
  getChatGroupUsers,
  getChatVendorGroupUsers,
  getAllChatGroupsByUser,
  findMessageReadStatusByGroupIds,
  isEligibleForNewChatVendor,

  // Chat file attachments
  getAttachmentUrlForChat,
  attachSmallAttachmentForChat,
  initiateLargeAttachmentForChat,
  finalizeLargeAttachmentForChat,

  // Chat Sync
  syncBranchChatAbility,
  syncChatUserAccessForBranch,
  syncSystemChatGroupsForBranch,
};
