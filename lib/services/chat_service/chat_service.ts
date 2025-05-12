/**
 * @deprecated use chat v2 service
 */
import config from 'config';
import { FilterQuery } from 'mongoose';
import { cacheService, jobService, locationService, userService } from '..';
import {
  ActiveStateEnum,
  ChatGroupEnum,
  GroupNamePrefixEnum,
  JobCategoryEnum,
  QBCustomClassNameEnum,
  UserLevelEnum,
  UserStatusEnum,
  VendorExternalEnum,
} from '../../enums';
import { logError, logInfo } from '../../log/util';
import { OBChatGroupModel, OBQuickBloxMessageBackupModel } from '../../models';
import {
  ChatUpsertOperationType,
  GroupVisibilityLevelEnum,
  OBChatGroupUserSchemaType,
  OBProfileUpsertOperationType,
  OBQuickBloxMessageBackupSchemaType,
  OBUserSchemaType,
  QuickBloxChatGroupType,
  QuickBloxMessageType,
  QuickBloxUserType,
  QuickbloxUserUpsertOperationType,
} from '../../types';
import {
  compareUserDataChange,
  mapAccessLevelToName,
  makeChatGroupName,
  resolveByBatch,
  chunkArray,
  getEffectiveJobRole,
  getEffectiveBranchIds,
} from '../../utils';
import {
  addUsersToGroup,
  createUser,
  listUsers,
  deleteUser,
  updateUser as quickbloxUpdateUser,
  createGroup as quickbloxCreateGroup,
  listGroups as quickbloxListGroups,
  deleteGroup,
  removeUsersFromGroup,
  updateGroup,
  getGroupMessages,
} from '../../vendors';

const { rootUserId, maxMessageProcessLimit }: { rootUserId: string; maxMessageProcessLimit: number } =
  config.get('Services.quickblox');

type GroupDataType = {
  groupId?: string;
  branchId: string;
  branchName: string;
  groupName: string;
  groupType: ChatGroupEnum;
  userIds: { quickBloxId: string; employeePsId: string }[];
  primaryUserPsId?: string;
  isArchived?: boolean;
};

const getChatGroupsByFilter = async (
  transactionId: string,
  filters: FilterQuery<OBChatGroupUserSchemaType>,
  options?: {
    skip?: number;
    limit?: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  },
): Promise<OBChatGroupUserSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getChatGroupsByFilter - find chat groups by filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  try {
    const searchQuery: FilterQuery<OBChatGroupUserSchemaType> = {};
    if (options && options.search) {
      const searchRegex = new RegExp(options.search, 'i');
      searchQuery.$or = [{ groupName: searchRegex }];
    }

    const sortQuery: any = {};
    if (options && options.sortField) {
      sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
    } else {
      sortQuery.createdAt = -1; // Default sort by createdAt in descending order
    }

    const chatGroupQueryCursor = OBChatGroupModel.find({
      ...filters,
      ...searchQuery,
    })
      .sort(sortQuery)
      .skip(options?.skip ?? 0)
      .limit(options?.limit ?? 100)
      .cursor();

    const filteredChatGroups: OBChatGroupUserSchemaType[] = [];

    for await (const chatGroup of chatGroupQueryCursor) {
      filteredChatGroups.push(chatGroup.toJSON());
    }

    logInfo(
      `[${transactionId}] [SERVICE] getChatGroupsByFilter - all chat groups retrieved filters: ${JSON.stringify(
        filters,
      )} and count: ${filteredChatGroups.length}`,
    );

    return filteredChatGroups;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getChatGroupsByFilter - FAILED,  reason: ${listErr.message}`);
    throw listErr;
  }
};

const createGroupUsersOB = async (transactionId: string, groupData: GroupDataType): Promise<boolean> => {
  logInfo(`[${transactionId}] [SERVICE] createGroupUsersOB initiated for group, id: ${groupData.groupId}`);

  try {
    if (!groupData.groupId) {
      throw new Error('Group Id is missing!');
    }

    const { userIds } = groupData;

    const usersInfo = await userService.getObUsersByPsIds(
      transactionId,
      userIds.map((ele) => ele.employeePsId),
    );

    const usersInfoMap = new Map<string, OBUserSchemaType>();

    usersInfo.forEach((user) => {
      usersInfoMap.set(user.employeePsId, user);
    });

    const createChatGroupUsers: OBChatGroupUserSchemaType[] = [];

    for (const userData of userIds) {
      let isGroupCreator = false;

      const userInfo = usersInfoMap.get(userData.employeePsId);
      const accessLevelName = mapAccessLevelToName(userInfo.job.level);

      if (groupData.groupType === ChatGroupEnum.Group && accessLevelName === UserLevelEnum.FIELD_STAFF) {
        isGroupCreator = true;
      }

      createChatGroupUsers.push({
        groupId: groupData.groupId,
        quickBloxId: userData.quickBloxId,
        groupName: groupData.groupName,
        groupType: groupData.groupType,
        branchId: groupData.branchId,
        employeePsId: userData.employeePsId,
        visibilityLevel: GroupVisibilityLevelEnum.ADMIN,
        isGroupCreator,
        activeStatus: ActiveStateEnum.Active,
        isActivated: true,
        createdAt: new Date(),
      });
    }

    logInfo(`[${transactionId}] [SERVICE] createGroupUsersOB - create record initiated for group users in OB`);

    await OBChatGroupModel.insertMany(createChatGroupUsers);

    logInfo(`[${transactionId}] [SERVICE] createGroupUsersOB - create record completed for group users in OB`);

    return true;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createGroupUsersOB - ERROR creating group users, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const getGroupUsersOB = async (
  transactionId: string,
  filters: FilterQuery<OBChatGroupUserSchemaType>,
  options?: { skip?: number; limit?: number },
): Promise<OBChatGroupUserSchemaType[]> => {
  logInfo(`[${transactionId}] [SERVICE] [getGroupUsersOB] Initiated, filters: ${JSON.stringify(filters)}`);

  try {
    const chatGroupUsersQuery = OBChatGroupModel.find({
      ...filters,
    })
      .skip(options?.skip ?? 0)
      .limit(options?.limit ?? 10)
      .cursor();

    const obGroupUsers: OBChatGroupUserSchemaType[] = [];

    for await (const obUser of chatGroupUsersQuery) {
      obGroupUsers.push(obUser.toJSON());
    }

    logInfo(`[${transactionId}] [SERVICE] [getGroupUsersOB] Retrieved, length: ${obGroupUsers.length}`);

    return obGroupUsers;
  } catch (fetchErr) {
    logError(
      `[${transactionId}] [SERVICE] getGroupUsersOB - unable to fetch chat group users, reason: ${fetchErr.message} `,
    );

    throw fetchErr;
  }
};

const updateGroupUserOB = async (
  transactionId: string,
  filters: Partial<OBChatGroupUserSchemaType>,
  groupData: Partial<OBChatGroupUserSchemaType>,
): Promise<number> => {
  logInfo(`[${transactionId}] [SERVICE] updateGroupUserOB Initiated`);

  try {
    const { modifiedCount } = await OBChatGroupModel.updateMany(
      {
        ...filters,
      },
      {
        ...groupData,
        updatedAt: new Date(),
      },
      { new: true },
    );

    return modifiedCount;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updateGroupUserOB - ERROR while updating groups, reason: ${updateErr.message}`,
    );

    throw updateErr;
  }
};

const deleteGroupUserOB = async (
  transactionId: string,
  groupData: {
    groupId: string;
    branchId: string;
    quickBloxId: string;
    activeStatus?: ActiveStateEnum;
    employeePsId?: string;
  },
): Promise<number> => {
  logInfo(`[${transactionId}] [SERVICE] deleteGroupUserOB Initiated, ${JSON.stringify(groupData)}`);

  try {
    const { deletedCount } = await OBChatGroupModel.deleteOne(groupData);

    return deletedCount;
  } catch (deleteErr) {
    logError(
      `[${transactionId}] [SERVICE] deleteGroupUserOB - ERROR while deleting groups, reason: ${deleteErr.message}`,
    );

    throw deleteErr;
  }
};

const createQBUser = async (transactionId: string, userData: QuickbloxUserUpsertOperationType): Promise<string> => {
  logInfo(
    `[${transactionId}] [SERVICE] createQBUser - create user in quickblox initiated, psId: ${userData.customData.psId}`,
  );

  try {
    const { employeePsId, quickBloxId, quickBloxPassword } = await createUser(transactionId, userData);

    logInfo(
      `[${transactionId}] [SERVICE] createQBUser - create user in quickblox SUCCESSFUL, quickBloxId: ${quickBloxId}`,
    );

    await userService.updateUserByPsId(transactionId, {
      psId: employeePsId,
      vendors: { quickBloxId, quickBloxPassword },
    });

    logInfo(`[${transactionId}] [SERVICE] createQBUser - update user in v3 SUCCESSFUL`);

    return employeePsId;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] createQBUser - ERROR while creating user in quickblox, reason: ${error.message}`,
    );

    throw error;
  }
};

const getQbUsersByEmails = async (transactionId: string, emails: string[]): Promise<QuickBloxUserType[]> => {
  logInfo(`[${transactionId}] [SERVICE] [getQbUsersByEmails] Initiated, total emails: ${emails.length}`);

  try {
    let quickBloxUsers: QuickBloxUserType[] = [];

    const processFn = async (emails: string[]) => {
      if (emails.length === 0) {
        return;
      }

      const users = await listUsers(transactionId, { emails }, { limit: 100 });

      quickBloxUsers = quickBloxUsers.concat(users);
    };

    await resolveByBatch(emails, 100, processFn);

    logInfo(
      `[${transactionId}] [SERVICE] [getQbUsersByEmails] COMPLETED, total users retrieved: ${quickBloxUsers.length}`,
    );

    return quickBloxUsers;
  } catch (fetchErr) {
    logError(
      `[${transactionId}] [SERVICE] getQbUsersByEmails - unable to fetch users from quickblox, reason: ${fetchErr.message} `,
    );

    throw fetchErr;
  }
};

const listChatGroupsFromQuickblox = async (
  transactionId: string,
  filters?: { quickbloxIds?: string[]; groupId?: string; branchId?: string; groupType?: ChatGroupEnum },
  options?: { skip?: number; limit?: number },
): Promise<QuickBloxChatGroupType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] [listChatGroupsFromQuickblox] Initiated, filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  try {
    const quickbloxGroups = await quickbloxListGroups(transactionId, filters, options);

    return quickbloxGroups ?? [];
  } catch (fetchErr) {
    logError(
      `[${transactionId}] [SERVICE] [listChatGroupsFromQuickblox] - unable to fetch chat groups from quickblox, reason: ${fetchErr.message} `,
    );

    throw fetchErr;
  }
};

const checkValidUsersInQuickBlox = async (
  transactionId: string,
  branchId: string,
): Promise<{
  missingQuickbloxUsers: QuickbloxUserUpsertOperationType[];
  validUsers: OBUserSchemaType[];
  activeUsers: OBUserSchemaType[];
}> => {
  logInfo(
    `[${transactionId}] [SERVICE] checkValidUsersInQuickBlox - checking if  users in branch: ${branchId} exists in quickblox`,
  );

  try {
    let allUsers: OBUserSchemaType[] = [];
    let hasMoreUsers = true;
    let skip = 0;

    while (hasMoreUsers) {
      const users = await userService.getObUsersByBranchIds(transactionId, [branchId], [1, 2, 3, 4, 5], {
        activeOnly: true,
        skip,
        limit: 200,
      });

      allUsers = allUsers.concat(users);

      if (users.length < 200) {
        hasMoreUsers = false;
      } else {
        skip += 200;
      }
    }

    logInfo(
      `[${transactionId}] [SERVICE] checkValidUsersInQuickBlox - users retrieved for branch: ${branchId}, total users: ${allUsers.length}`,
    );

    const usersMap = new Map<string, OBUserSchemaType>();
    // Currently only ACTIVE users from the branch can be part of the chat group
    const activeUsers = allUsers.filter((user) => user.activeStatus === UserStatusEnum.Active);

    logInfo(
      `[${transactionId}] [SERVICE] checkValidUsersInQuickBlox - total active users retrieved for: ${activeUsers.length}`,
    );

    // Add users to quickblox if they doesn't exist
    const missingQuickbloxUsers: QuickbloxUserUpsertOperationType[] = [];
    const validUsers = [];

    const userQuickBloxIds = [];
    const invalidUserPsIds = [];
    let userEmails: string[] = [];

    for (const user of activeUsers) {
      const vendorSystem = user.vendorSystems.find(
        (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
      );

      userEmails.push(user.workEmail);

      if (!vendorSystem) {
        const effectiveBranchIds: string[] = getEffectiveBranchIds(
          user.branchAccess.overriddenBranchIds,
          user.branchAccess.selectedBranchIds,
        );

        missingQuickbloxUsers.push({
          email: user.workEmail,
          displayName: user.displayName,
          customData: {
            accessLevel: user.obAccess.level,
            branchIds: effectiveBranchIds,
            jobId: getEffectiveJobRole(user.obAccess, user.job).jobId,
            jobCode: getEffectiveJobRole(user.obAccess, user.job).code,
            jobLevel: getEffectiveJobRole(user.obAccess, user.job).level,
            psId: user.employeePsId,
            profileImage: user.tempProfile?.tempProfileImgUrl,
          },
        });
      } else {
        const [userQBId] = vendorSystem.vendorValue.split('|');
        if (userQBId === 'UNK_ID') {
          invalidUserPsIds.push(user.employeePsId);
        } else {
          userQuickBloxIds.push(userQBId);
          usersMap.set(userQBId, user);
        }
      }
    }

    logInfo(
      `[${transactionId}] [SERVICE] createGroup - users with unknown quickblox id, employeePsIds: ${JSON.stringify(
        invalidUserPsIds,
      )}`,
    );

    // Check if users exists in quickblox with quickblox id
    let quickBloxUsers: QuickBloxUserType[] = [];

    logInfo(
      `[${transactionId}] [SERVICE] checkValidUsersInQuickBlox - check users existing in quickblox, length: ${userQuickBloxIds.length}`,
    );

    if (userQuickBloxIds.length) {
      const userIdBuckets = chunkArray(userQuickBloxIds, 100);

      const aggregatedUsersQueryResults = await Promise.allSettled(
        userIdBuckets.map((userIds) => listUsers(transactionId, { quickbloxIds: userIds }, { limit: 100 })),
      );

      aggregatedUsersQueryResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          quickBloxUsers = quickBloxUsers.concat(result.value);
        }
      });
    }

    logInfo(
      `[${transactionId}] [SERVICE] checkValidUsersInQuickBlox - total retrieved users with quickblox id: ${quickBloxUsers.length}`,
    );

    // Check if users exists in quickblox with emails
    const mappedQuickbloxEmails = quickBloxUsers.map((user) => user.email);
    userEmails = userEmails.filter((email) => !mappedQuickbloxEmails.includes(email));

    logInfo(
      `[${transactionId}] [SERVICE] checkValidUsersInQuickBlox - check users existing in quickblox with emails, total users: ${userEmails.length}`,
    );

    if (userEmails.length) {
      const userEmailBuckets = chunkArray(userEmails, 100);

      const aggregatedUsersQueryResults = await Promise.allSettled(
        userEmailBuckets.map((emails) => listUsers(transactionId, { emails }, { limit: 100 })),
      );

      aggregatedUsersQueryResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          quickBloxUsers = quickBloxUsers.concat(result.value);
        }
      });
    }

    logInfo(
      `[${transactionId}] [SERVICE] checkValidUsersInQuickBlox - users retrieved from quickblox, total users: ${quickBloxUsers.length}`,
    );

    const quickBloxUsersIdMap = new Map<string, QuickBloxUserType>();
    const quickBloxUsersEmailMap = new Map<string, QuickBloxUserType>();

    quickBloxUsers.forEach((user) => {
      quickBloxUsersIdMap.set(user.id.toString(), user);
      quickBloxUsersEmailMap.set(user.email, user);
    });

    userQuickBloxIds.forEach((id) => {
      const user = usersMap.get(id);
      if (quickBloxUsersIdMap.has(id)) {
        validUsers.push(user);
      } else {
        const effectiveBranchIds: string[] = getEffectiveBranchIds(
          user.branchAccess.overriddenBranchIds,
          user.branchAccess.selectedBranchIds,
        );

        missingQuickbloxUsers.push({
          email: user.workEmail,
          displayName: user.displayName,
          customData: {
            accessLevel: user.obAccess.level,
            branchIds: effectiveBranchIds,
            jobId: getEffectiveJobRole(user.obAccess, user.job).jobId,
            jobCode: getEffectiveJobRole(user.obAccess, user.job).code,
            jobLevel: getEffectiveJobRole(user.obAccess, user.job).level,
            psId: user.employeePsId,
            profileImage: user.tempProfile?.tempProfileImgUrl,
          },
        });
      }
    });

    const removeUserIds = [];

    missingQuickbloxUsers.forEach((missingUser) => {
      const invalidQuickbloxUser = quickBloxUsersEmailMap.get(missingUser.email);

      if (invalidQuickbloxUser) {
        removeUserIds.push(invalidQuickbloxUser.id);
      }
    });

    logInfo(
      `[${transactionId}] [SERVICE] checkValidUsersInQuickBlox - delete users from quickblox initiated, total users: ${removeUserIds.length}`,
    );

    await Promise.allSettled(removeUserIds.map((userId) => deleteUser(transactionId, userId)));

    logInfo(`[${transactionId}] [SERVICE] checkValidUsersInQuickBlox - delete users from quickblox COMPLETED`);

    logInfo(`[${transactionId}] [SERVICE] checkValidUsersInQuickBlox - SUCCESSFUL`);

    return {
      missingQuickbloxUsers,
      validUsers,
      activeUsers,
    };
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] checkValidUsersInQuickBlox - ERROR while validating users, reason: ${error.message}`,
    );

    throw error;
  }
};

const compareOBAndQuickbloxUsers = async (
  transactionId: string,
  obUsersIds: {
    quickBloxId: string;
    employeePsId: string;
  }[],
  quickbloxUsersIds: string[],
  groupData: Partial<GroupDataType>,
) => {
  logInfo(`[${transactionId}] [SERVICE] compareOBAndQuickbloxUsers - initiated for group, id: ${groupData.groupId}`);

  try {
    logInfo(
      `[${transactionId}] [SERVICE] compareOBAndQuickbloxUsers - total onebayshore users: ${obUsersIds.length}, total quickblox users: ${quickbloxUsersIds.length}`,
    );

    const { branchId, branchName, groupName, groupId, groupType } = groupData;

    const obUsersMap = new Map();

    obUsersIds.forEach((user) => {
      obUsersMap.set(user.quickBloxId, user.employeePsId);
    });

    const quickbloxUsersMap = new Set(quickbloxUsersIds);

    const addUsersQBIds = obUsersIds.map((id) => id.quickBloxId).filter((obUserId) => !quickbloxUsersMap.has(obUserId));
    const removeUsersQBIds = quickbloxUsersIds.filter(
      (qbUserId) => !obUsersMap.has(qbUserId) && qbUserId !== rootUserId,
    );

    logInfo(`[${transactionId}] [SERVICE] compareOBAndQuickbloxUsers - add and remove users from quickblox initiated`);

    logInfo(
      `[${transactionId}] [SERVICE] compareOBAndQuickbloxUsers - total add users: ${addUsersQBIds.length}, total remove users: ${removeUsersQBIds.length}`,
    );

    // Adding and Removing users from QuickBlox chat group
    if (addUsersQBIds.length) {
      await addUsersToGroup(transactionId, groupId, addUsersQBIds);

      // Adding users to chat group user collection
      const results = await createGroupUsersOB(transactionId, {
        branchId,
        branchName,
        groupName,
        groupType,
        userIds: addUsersQBIds.map((quickBloxId) => {
          const employeePsId = obUsersMap.get(quickBloxId);

          return { quickBloxId, employeePsId };
        }),
        groupId,
      });

      logInfo(
        `[${transactionId}] [SERVICE] compareOBAndQuickbloxUsers - adding users to QB group COMPLETED, results: ${JSON.stringify(
          results,
        )}`,
      );
    }

    if (removeUsersQBIds.length) {
      await removeUsersFromGroup(transactionId, groupId, removeUsersQBIds);

      // Removing users from chat group user collection
      const aggregatedRemoveQueryResults = await Promise.allSettled(
        removeUsersQBIds.map((quickBloxId) => {
          return OBChatGroupModel.deleteOne({
            groupId,
            branchId,
            quickBloxId,
          });
        }),
      );

      aggregatedRemoveQueryResults.forEach((removeQuery) => {
        if (removeQuery.status === 'rejected') {
          logError(
            `[${transactionId}] [SERVICE] compareOBAndQuickbloxUsers - ERROR while removing users from QB group, reason: ${removeQuery.reason}`,
          );

          return;
        }
      });

      logInfo(`[${transactionId}] [SERVICE] compareOBAndQuickbloxUsers - removing users from QB group COMPLETED`);
    }

    logInfo(`[${transactionId}] [SERVICE] compareOBAndQuickbloxUsers - SUCCESSFUL`);

    return;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] compareOBAndQuickbloxUsers - ERROR while syncing groups and users, reason: ${error.message}`,
    );

    throw error;
  }
};

const createGroupQB = async (transactionId: string, groupData: GroupDataType): Promise<boolean> => {
  logInfo(`[${transactionId}] [SERVICE] createGroup - creating all members groups initiated`);

  try {
    const { userIds } = groupData;

    const quickbloxData: ChatUpsertOperationType = {
      branchId: groupData.branchId,
      branchName: groupData.branchName,
      className: QBCustomClassNameEnum.GroupMetadata,
      groupName: groupData.groupName,
      groupType: groupData.groupType,
      isAuto: false,
      occupantIds: userIds.filter(({ quickBloxId }) => quickBloxId !== 'UNK_ID').map(({ quickBloxId }) => quickBloxId),
      isArchived: groupData.isArchived,
    };

    // Log the users whose quickblox id = 'UNK_ID'
    const invalidPsIds = userIds
      .filter(({ quickBloxId }) => quickBloxId === 'UNK_ID')
      .map(({ employeePsId }) => employeePsId);

    logInfo(
      `[${transactionId}] [SERVICE] createGroup - users with unknown quickblox id, employeePsIds: ${JSON.stringify(
        invalidPsIds,
      )}`,
    );

    if (groupData.primaryUserPsId) {
      quickbloxData.primaryUserPsId = groupData.primaryUserPsId;
    }

    const groupId = await quickbloxCreateGroup(transactionId, quickbloxData);

    logInfo(`[${transactionId}] [SERVICE] createGroup - create group in quickblox successful, groupId: ${groupId}`);

    const results = await createGroupUsersOB(transactionId, { ...groupData, groupId });

    return results;
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] createGroup - ERROR creating group, reason: ${createErr.message}`);

    throw createErr;
  }
};

const createMultipleGroups = async (transactionId: string, branchId: string): Promise<boolean> => {
  logInfo(`[${transactionId}] [SERVICE] createMultipleGroups - creating groups by branch id: ${branchId}`);

  try {
    const branchDetail = await locationService.getBranchDetailsById(transactionId, branchId);

    const existingGroups = await listChatGroupsFromQuickblox(transactionId, { branchId });

    const existingGroupsMap = new Map();

    if (Array.isArray(existingGroups) && existingGroups.length !== 0) {
      existingGroups.forEach((group) => {
        if (group.name.startsWith(GroupNamePrefixEnum.AllMembers)) {
          existingGroupsMap.set(GroupNamePrefixEnum.AllMembers, group);
        } else if (group.name.startsWith(GroupNamePrefixEnum.Clinical)) {
          existingGroupsMap.set(GroupNamePrefixEnum.Clinical, group);
        } else if (group.name.startsWith(GroupNamePrefixEnum.NonClinical)) {
          existingGroupsMap.set(GroupNamePrefixEnum.NonClinical, group);
        }
      });
    }

    if (
      existingGroupsMap.has(GroupNamePrefixEnum.AllMembers) &&
      existingGroupsMap.has(GroupNamePrefixEnum.Clinical) &&
      existingGroupsMap.has(GroupNamePrefixEnum.NonClinical)
    ) {
      return true;
    }

    logInfo(`[${transactionId}] [SERVICE] createMultipleGroups - retrieving users initiated`);

    const { validUsers } = await checkValidUsersInQuickBlox(transactionId, branchId);

    const fieldStaffs = validUsers.filter(
      (user) => mapAccessLevelToName(getEffectiveJobRole(user.obAccess, user.job).level) === UserLevelEnum.FIELD_STAFF,
    );
    const adminStaffs = validUsers.filter(
      (user) => mapAccessLevelToName(getEffectiveJobRole(user.obAccess, user.job).level) === UserLevelEnum.BRANCH_ADMIN,
    );

    // Fetching job categories for the users

    const jobIdMap = new Set<string>(fieldStaffs.map((user) => getEffectiveJobRole(user.obAccess, user.job).jobId));

    logInfo(`[${transactionId}] [SERVICE] createMultipleGroups - retrieving job roles for the users initiated`);

    const aggregatedJobRoleQueryResults = await Promise.allSettled(
      Array.from(jobIdMap).map((jobId) => jobService.getJobById(transactionId, jobId)),
    );

    const jobCategoriesMap = new Map<string, JobCategoryEnum[]>();

    aggregatedJobRoleQueryResults.forEach((jobResult) => {
      if (jobResult.status === 'fulfilled') {
        jobCategoriesMap.set(jobResult.value.jobId, jobResult.value.jobCategories);
      }
    });

    const createGroupsData: GroupDataType[] = [];

    // All Members Group
    if (!existingGroupsMap.has(GroupNamePrefixEnum.AllMembers)) {
      createGroupsData.push({
        branchId: branchDetail.branchId,
        branchName: branchDetail.branchName,
        groupName: makeChatGroupName(GroupNamePrefixEnum.AllMembers, branchId, branchDetail.branchName),
        groupType: ChatGroupEnum.Broadcast,
        userIds: validUsers.map(({ employeePsId, vendorSystems }) => {
          const quickBloxVendor = vendorSystems.find(
            (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
          );
          const [quickBloxId] = quickBloxVendor.vendorValue.split('|');

          return { quickBloxId, employeePsId };
        }),
      });
    }

    // Clinical Group
    if (!existingGroupsMap.has(GroupNamePrefixEnum.Clinical)) {
      const clinicalFieldStaffs = fieldStaffs.filter((user) => {
        const { jobId } = getEffectiveJobRole(user.obAccess, user.job);
        const userJobCategories = jobCategoriesMap.get(jobId);

        return Array.isArray(userJobCategories) && userJobCategories.includes(JobCategoryEnum.Clinical);
      });

      const clinicalUsers = adminStaffs.concat(clinicalFieldStaffs);

      createGroupsData.push({
        branchId: branchDetail.branchId,
        branchName: branchDetail.branchName,
        groupName: makeChatGroupName(GroupNamePrefixEnum.Clinical, branchId, branchDetail.branchName),
        groupType: ChatGroupEnum.Broadcast,
        userIds: clinicalUsers.map(({ employeePsId, vendorSystems }) => {
          const quickBloxVendor = vendorSystems.find(
            (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
          );
          const [quickBloxId] = quickBloxVendor.vendorValue.split('|');

          return { quickBloxId, employeePsId };
        }),
      });
    }

    // Non-clinical Group
    if (!existingGroupsMap.has(GroupNamePrefixEnum.NonClinical)) {
      const nonClinicalFieldStaffs = fieldStaffs.filter((user) => {
        const { jobId } = getEffectiveJobRole(user.obAccess, user.job);
        const userJobCategories = jobCategoriesMap.get(jobId);

        return Array.isArray(userJobCategories) && userJobCategories.includes(JobCategoryEnum.NonClinical);
      });

      const nonClinicalUsers = adminStaffs.concat(nonClinicalFieldStaffs);

      createGroupsData.push({
        branchId: branchDetail.branchId,
        branchName: branchDetail.branchName,
        groupName: makeChatGroupName(GroupNamePrefixEnum.NonClinical, branchId, branchDetail.branchName),
        groupType: ChatGroupEnum.Broadcast,
        userIds: nonClinicalUsers.map(({ employeePsId, vendorSystems }) => {
          const quickBloxVendor = vendorSystems.find(
            (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
          );
          const [quickBloxId] = quickBloxVendor.vendorValue.split('|');

          return { quickBloxId, employeePsId };
        }),
      });
    }

    const aggregatedGroupQueryResults = await Promise.allSettled(
      createGroupsData.map((groupData) => createGroupQB(transactionId, groupData)),
    );

    aggregatedGroupQueryResults.forEach((group) => {
      if (group.status === 'rejected') {
        logError(
          `[${transactionId}] [SERVICE] createMultipleGroups - ERROR while creating group, reason: ${group.reason}`,
        );

        return;
      }
    });

    logInfo(`[${transactionId}] [SERVICE] createMultipleGroups - chat groups created SUCCESSFUL`);

    return true;
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] createMultipleGroups - ERROR creating groups, reason: ${createErr.message}`);

    throw createErr;
  }
};

/**
 * Steps in syncing chat groups and its users:
 * 1. For a branch, query the list of current users who are active (and inactive)
 * 2. Get the qb groups for the selected branch id with user qb ids in each group
 * 3. Check if all of the valid users have quickblox data
 * 4. If users are missing qb data, create those users in qb and store their information in the user collection.
 * 5. Now compare the users from ob and users from qb based on the quickblox id
 * 6. For All members - group, if any ob user NOT in qb group, add them.
 * 7. For Clinical/Non-Clinical group, based on the job category check if the user is added to the qb group else add them to the appropriate group
 * 8. If any qb user id not in ob branch user group then the user is technically removed from that branch and so remove the user from the appropriate groups and from the chat group mongo collection.
 */
const syncChatGroupForBranch = async (transactionId: string, branchId: string): Promise<boolean> => {
  logInfo(
    `[${transactionId}] [SERVICE] syncChatGroupForBranch - checking if  users in branch: ${branchId} exists in quickblox`,
  );

  try {
    const branchDetail = await locationService.getBranchDetailsById(transactionId, branchId);

    if (!branchDetail) {
      throw new Error('No such branch exists');
    }

    // Retrieve existing groups of a branch from QuickBlox
    let allQuickBloxGroups: QuickBloxChatGroupType[] = [];
    let hasMoreGroups = true;
    let skip = 0;

    while (hasMoreGroups) {
      const existingGroups = await listChatGroupsFromQuickblox(transactionId, { branchId }, { skip, limit: 100 });

      allQuickBloxGroups = allQuickBloxGroups.concat(existingGroups);

      if (existingGroups.length < 100) {
        hasMoreGroups = false;
      } else {
        skip += 100;
      }
    }

    const existingGroupsMap = new Map<string, QuickBloxChatGroupType>();

    if (Array.isArray(allQuickBloxGroups) && allQuickBloxGroups.length !== 0) {
      allQuickBloxGroups.forEach((group) => {
        if (group.name.startsWith(GroupNamePrefixEnum.AllMembers)) {
          existingGroupsMap.set(GroupNamePrefixEnum.AllMembers, group);
        } else if (group.name.startsWith(GroupNamePrefixEnum.Clinical)) {
          existingGroupsMap.set(GroupNamePrefixEnum.Clinical, group);
        } else if (group.name.startsWith(GroupNamePrefixEnum.NonClinical)) {
          existingGroupsMap.set(GroupNamePrefixEnum.NonClinical, group);
        }
      });
    }

    logInfo(
      `[${transactionId}] [SERVICE] syncChatGroupForBranch - Synchronizing existing chat groups. Total Groups: ${
        existingGroupsMap.size
      }. Group Details: ${JSON.stringify(existingGroupsMap)}`,
    );

    logInfo(
      `[${transactionId}] [SERVICE] syncChatGroupForBranch - existing chat groups ${
        allQuickBloxGroups.length ? 'Found' : 'Not Found'
      }, length: ${allQuickBloxGroups.length}`,
    );

    // Query and Check All the Valid Users
    const { missingQuickbloxUsers = [], validUsers: validUsersOB = [] } = await checkValidUsersInQuickBlox(
      transactionId,
      branchId,
    );

    // Update quickblox info of users in OB
    if (missingQuickbloxUsers.length !== 0) {
      logInfo(
        `[${transactionId}] [SERVICE] syncChatGroupForBranch - missing users in quickblox, length: ${missingQuickbloxUsers.length}`,
      );

      const aggregatedQBUsersQueryResult = await Promise.allSettled(
        missingQuickbloxUsers.map((missingUser) => createUser(transactionId, missingUser)),
      );

      const updateUsersInfo: Partial<OBProfileUpsertOperationType>[] = [];

      aggregatedQBUsersQueryResult.forEach((userQueryResult) => {
        if (userQueryResult.status === 'fulfilled') {
          const { employeePsId, quickBloxPassword, quickBloxId = 'UNK_ID' } = userQueryResult.value;

          updateUsersInfo.push({
            psId: employeePsId,
            vendors: {
              quickBloxId,
              quickBloxPassword,
            },
          });
        } else {
          logError(
            `[${transactionId}] [SERVICE] syncChatGroupForBranch - ERROR while creating user in quickblox, reason: ${userQueryResult.reason}`,
          );
        }
      });

      logInfo(`[${transactionId}] [SERVICE] syncChatGroupForBranch - missing users created in quickblox`);

      const updatedUsersPsIds: string[] = [];

      const processFn = async (updateUsers: Partial<OBProfileUpsertOperationType>[]) => {
        const aggregatedUpdatedUsersQueryResult = await Promise.allSettled(
          updateUsers.map((user) => userService.updateUserByPsId(transactionId, user)),
        );

        aggregatedUpdatedUsersQueryResult.forEach((userQueryResult) => {
          if (userQueryResult.status === 'rejected') {
            logError(
              `[${transactionId}] [SERVICE] syncChatGroupForBranch - ERROR while updating user in mongo, reason: ${userQueryResult.reason}`,
            );
          } else {
            updatedUsersPsIds.push(userQueryResult.value);
          }
        });
      };

      await resolveByBatch(updateUsersInfo, 100, processFn);

      const updatedUsers = await userService.getObUsersByPsIds(transactionId, updatedUsersPsIds);

      validUsersOB.push(...updatedUsers);
    }

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForBranch - checking valid users in quickblox completed`);

    const fieldStaffs = validUsersOB.filter(
      (user) => mapAccessLevelToName(getEffectiveJobRole(user.obAccess, user.job).level) === UserLevelEnum.FIELD_STAFF,
    );

    const adminStaffs = validUsersOB.filter(
      (user) => mapAccessLevelToName(getEffectiveJobRole(user.obAccess, user.job).level) === UserLevelEnum.BRANCH_ADMIN,
    );

    logInfo(
      `[${transactionId}] [SERVICE] syncChatGroupForBranch - Synchronizing chat groups. Field Staffs Count: ${fieldStaffs.length}, Admin Staffs Count: ${adminStaffs.length}.`,
    );

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForBranch - create individual chat group initiated`);

    // Create individual chat groups for u1 user
    const createIndividualGroupsData: GroupDataType[] = [];

    const existingIndividualChatMapByPsId = new Map<string, OBChatGroupUserSchemaType>();
    const existingIndividualChatMapByGroupId = new Map<string, OBChatGroupUserSchemaType>();

    const retrieveGroupUsersData: Partial<OBChatGroupUserSchemaType>[] = fieldStaffs.map((user) => {
      const vendorSystem = user.vendorSystems.find(
        (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
      );

      const [quickBloxId] = vendorSystem.vendorValue.split('|');

      return {
        quickBloxId,
        employeePsId: user.employeePsId,
      };
    });

    const processFn = async (groupUsersOB: Partial<OBChatGroupUserSchemaType>[]) => {
      const allGroupUsers = await getGroupUsersOB(
        transactionId,
        {
          quickBloxId: { $in: groupUsersOB.map(({ quickBloxId }) => quickBloxId) },
          employeePsId: { $in: groupUsersOB.map(({ employeePsId }) => employeePsId) },
          branchId,
          groupType: ChatGroupEnum.Group,
          isGroupCreator: true,
          activeStatus: ActiveStateEnum.Active,
        },
        { skip: 0, limit: 300 },
      );

      logInfo(
        `[${transactionId}] [SERVICE] syncChatGroupForBranch - Total number of group users to sync: ${allGroupUsers.length}`,
      );

      allGroupUsers.forEach((groupUser) => {
        existingIndividualChatMapByPsId.set(groupUser.employeePsId, groupUser);
        existingIndividualChatMapByGroupId.set(groupUser.groupId, groupUser);
      });
    };

    await resolveByBatch(retrieveGroupUsersData, 300, processFn);

    const outdatedGroupIds = new Set<string>();

    // Delete the outdated quickblox chat groups and create new ones
    for (const user of fieldStaffs) {
      const vendorSystem = user.vendorSystems.find(
        (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
      );

      const [quickBloxId] = vendorSystem.vendorValue.split('|');
      const chatGroupName = makeChatGroupName(user.displayName, branchId, branchDetail.branchName);
      const existingChatGroupUser = existingIndividualChatMapByPsId.get(user.employeePsId);

      if (!existingChatGroupUser) {
        const outdatedGroups = allQuickBloxGroups.filter((group) => group.name === chatGroupName);

        if (outdatedGroups.length) {
          outdatedGroups.forEach(({ _id }) => outdatedGroupIds.add(_id));
        }

        createIndividualGroupsData.push({
          branchId,
          branchName: branchDetail.branchName,
          groupName: chatGroupName,
          groupType: ChatGroupEnum.Group,
          primaryUserPsId: user.employeePsId,
          isArchived: false,
          userIds: adminStaffs
            .map(({ employeePsId, vendorSystems }) => {
              const quickBloxVendor = vendorSystems.find(
                (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
              );
              const [quickBloxId] = quickBloxVendor.vendorValue.split('|');

              return { quickBloxId, employeePsId };
            })
            .concat([{ quickBloxId, employeePsId: user.employeePsId }]),
        });
      } else {
        const outdatedGroups = allQuickBloxGroups.filter(
          (group) => group._id !== existingChatGroupUser.groupId && group.name === chatGroupName,
        );

        if (outdatedGroups.length) {
          outdatedGroups.forEach(({ _id }) => outdatedGroupIds.add(_id));
        }

        const outdatedGroupOB = allQuickBloxGroups.find((group) => group._id === existingChatGroupUser.groupId);

        if (!outdatedGroupOB) {
          await OBChatGroupModel.deleteMany({
            groupId: existingChatGroupUser.groupId,
          });

          logInfo(
            `[${transactionId}] [SERVICE] syncChatGroupForBranch - deleting outdated onebayshore groups COMPLETED, psId: ${user.employeePsId}`,
          );
        }

        if (existingChatGroupUser.isArchived) {
          logInfo(`[${transactionId}] [SERVICE] syncChatGroupForBranch - unarchive individual chat group`);

          await updateGroup(transactionId, existingChatGroupUser.groupId, {
            className: QBCustomClassNameEnum.GroupMetadata,
            isArchived: false,
          });

          await updateGroupUserOB(
            transactionId,
            {
              groupId: existingChatGroupUser.groupId,
            },
            { isArchived: false },
          );

          logInfo(
            `[${transactionId}] [SERVICE] syncChatGroupForBranch - unarchive individual chat group COMPLETED, psId: ${user.employeePsId}`,
          );
        }

        // Delete all the duplicate individual groups of user if exists
        const duplicateGroups = await getGroupUsersOB(transactionId, {
          groupId: { $ne: existingChatGroupUser.groupId },
          branchId,
          isGroupCreator: true,
          activeStatus: ActiveStateEnum.Active,
          employeePsId: user.employeePsId,
          quickBloxId,
        });

        if (duplicateGroups.length) {
          await OBChatGroupModel.deleteMany({
            groupId: { $in: duplicateGroups.map(({ groupId }) => groupId) },
            branchId,
          });
        }

        logInfo(
          `[${transactionId}] [SERVICE] syncChatGroupForBranch - deleting duplicate individual chat groups COMPLETED, psId: ${user.employeePsId}, length: ${duplicateGroups.length}`,
        );
      }
    }

    logInfo(
      `[${transactionId}] [SERVICE] syncChatGroupForBranch - deleting outdated quickblox groups initiated, length: ${outdatedGroupIds.size}`,
    );

    // If the groups are deleted then it should be removed from allQuickBloxGroups fetched earlier
    if (outdatedGroupIds.size > 0) {
      allQuickBloxGroups = allQuickBloxGroups.filter((group) => !outdatedGroupIds.has(group._id));
      await Promise.allSettled(Array.from(outdatedGroupIds).map((groupId) => deleteGroup(transactionId, groupId)));

      logInfo(`[${transactionId}] [SERVICE] syncChatGroupForBranch - deleting outdated quickblox groups COMPLETED`);
    }

    const createProcessFn = async (createGroups: GroupDataType[]) => {
      const aggregatedGroupQueryResults = await Promise.allSettled(
        createGroups.map((groupData) => createGroupQB(transactionId, groupData)),
      );

      aggregatedGroupQueryResults.forEach((group) => {
        if (group.status === 'rejected') {
          logError(
            `[${transactionId}] [SERVICE] syncChatGroupForBranch - ERROR while creating individual chat groups, reason: ${group.reason}`,
          );

          return;
        }
      });
    };

    logInfo(
      `[${transactionId}] [SERVICE] syncChatGroupForBranch - create individual chat group initiated, length: ${createIndividualGroupsData.length}`,
    );

    await resolveByBatch(createIndividualGroupsData, 200, createProcessFn);

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForBranch - create individual chat group completed`);

    // Add admins to all the individual chat group
    const updateGroupsData = [];

    const adminStaffIds = adminStaffs.map((admin) => {
      const vendorSystem = admin.vendorSystems.find(
        (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
      );

      const [quickBloxId] = vendorSystem.vendorValue.split('|');

      return { quickBloxId, employeePsId: admin.employeePsId };
    });

    allQuickBloxGroups
      .filter((group) => !group.data.isAnnouncement)
      .forEach((group) => {
        const quickbloxUsersIds = group.occupants_ids.map((id) => id.toString());

        // Add primary user id for correctly comparing both field staff and admin staff
        const chatGroup = existingIndividualChatMapByGroupId.get(group._id);

        if (!chatGroup) {
          logInfo(
            `[${transactionId}] [SERVICE] syncChatGroupForBranch - individual chat group doesn't exist, groupId: ${group._id}`,
          );

          return;
        }

        updateGroupsData.push({
          obUserIds: adminStaffIds.concat({ employeePsId: chatGroup.employeePsId, quickBloxId: chatGroup.quickBloxId }),
          quickbloxUsersIds,
          groupName: group.name,
          groupId: group._id,
          groupType: group.data.isAnnouncement ? ChatGroupEnum.Broadcast : ChatGroupEnum.Group,
        });
      });

    logInfo(
      `[${transactionId}] [SERVICE] syncChatGroupForBranch - update individual chat group in quickblox initiated`,
    );

    const compareProcessFn = async (updateQBGroups) => {
      const aggregatedUpdateQueryResults = await Promise.allSettled(
        updateQBGroups.map(({ obUserIds, quickbloxUsersIds, groupName, groupId, groupType }) =>
          compareOBAndQuickbloxUsers(transactionId, obUserIds, quickbloxUsersIds, {
            branchId,
            branchName: branchDetail.branchName,
            groupName,
            groupId,
            groupType,
          }),
        ),
      );

      aggregatedUpdateQueryResults.forEach((queryResult) => {
        if (queryResult.status === 'rejected') {
          logError(
            `[${transactionId}] [SERVICE] syncChatGroupForBranch - ERROR while updating individual chat group in quickblox, reason: ${queryResult.reason}`,
          );
        }
      });
    };

    await resolveByBatch(updateGroupsData, 100, compareProcessFn);

    logInfo(
      `[${transactionId}] [SERVICE] syncChatGroupForBranch - update individual chat group in quickblox COMPLETED`,
    );

    // Comparing OB users and QB users for all members group
    if (existingGroupsMap.has(GroupNamePrefixEnum.AllMembers)) {
      const allMembersGroup = existingGroupsMap.get(GroupNamePrefixEnum.AllMembers);

      const quickbloxUsersIds = allMembersGroup.occupants_ids.map((id) => id.toString());
      const obUsersIds = validUsersOB.map((user) => {
        const vendorSystem = user.vendorSystems.find(
          (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
        );

        const [quickBloxId] = vendorSystem.vendorValue.split('|');

        return { quickBloxId, employeePsId: user.employeePsId };
      });

      await compareOBAndQuickbloxUsers(transactionId, obUsersIds, quickbloxUsersIds, {
        branchId,
        branchName: branchDetail.branchName,
        groupName: allMembersGroup.name,
        groupId: allMembersGroup._id,
        groupType: ChatGroupEnum.Broadcast,
      });
    }

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForBranch - All members Group sync COMPLETED`);

    // Fetching job categories for the users to differentiate clinical and non-clinical users
    const jobIdMap = new Set<string>(fieldStaffs.map((user) => getEffectiveJobRole(user.obAccess, user.job).jobId));

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForBranch - retrieving job roles for the users initiated`);

    const aggregatedJobRoleQueryResults = await Promise.allSettled(
      Array.from(jobIdMap).map((jobId) => jobService.getJobById(transactionId, jobId)),
    );

    const jobCategoriesMap = new Map<string, JobCategoryEnum[]>();

    aggregatedJobRoleQueryResults.forEach((jobResult) => {
      if (jobResult.status === 'fulfilled') {
        jobCategoriesMap.set(jobResult.value.jobId, jobResult.value.jobCategories);
      }
    });

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForBranch - retrieved job roles for the users`);

    // Comparing OB users and QB users for clinical group
    if (existingGroupsMap.has(GroupNamePrefixEnum.Clinical)) {
      const clinicalGroup = existingGroupsMap.get(GroupNamePrefixEnum.Clinical);

      const clinicalFieldStaffs = fieldStaffs.filter((user) => {
        const { jobId } = getEffectiveJobRole(user.obAccess, user.job);
        const userJobCategories = jobCategoriesMap.get(jobId);

        return Array.isArray(userJobCategories) && userJobCategories.includes(JobCategoryEnum.Clinical);
      });

      const clinicalUsers = adminStaffs.concat(clinicalFieldStaffs);

      const quickbloxUsersIds = clinicalGroup.occupants_ids.map((id) => id.toString());

      const obUsersIds = clinicalUsers.map((user) => {
        const vendorSystem = user.vendorSystems.find(
          (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
        );

        const [quickBloxId] = vendorSystem.vendorValue.split('|');

        return { quickBloxId, employeePsId: user.employeePsId };
      });

      await compareOBAndQuickbloxUsers(transactionId, obUsersIds, quickbloxUsersIds, {
        branchId,
        branchName: branchDetail.branchName,
        groupName: clinicalGroup.name,
        groupId: clinicalGroup._id,
        groupType: ChatGroupEnum.Broadcast,
      });
    }

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForBranch - Clinical Group sync COMPLETED`);

    // Comparing OB users and QB users for all non-clinical group
    if (existingGroupsMap.has(GroupNamePrefixEnum.NonClinical)) {
      const nonClinicalGroup = existingGroupsMap.get(GroupNamePrefixEnum.NonClinical);

      const nonClinicalFieldStaffs = fieldStaffs.filter((user) => {
        const { jobId } = getEffectiveJobRole(user.obAccess, user.job);
        const userJobCategories = jobCategoriesMap.get(jobId);

        return Array.isArray(userJobCategories) && userJobCategories.includes(JobCategoryEnum.NonClinical);
      });

      const nonClinicalUsers = adminStaffs.concat(nonClinicalFieldStaffs);

      const quickbloxUsersIds = nonClinicalGroup.occupants_ids.map((id) => id.toString());

      const obUsersIds = nonClinicalUsers.map((user) => {
        const vendorSystem = user.vendorSystems.find(
          (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
        );

        const [quickBloxId] = vendorSystem.vendorValue.split('|');

        return { quickBloxId, employeePsId: user.employeePsId };
      });

      await compareOBAndQuickbloxUsers(transactionId, obUsersIds, quickbloxUsersIds, {
        branchId,
        branchName: branchDetail.branchName,
        groupName: nonClinicalGroup.name,
        groupId: nonClinicalGroup._id,
        groupType: ChatGroupEnum.Broadcast,
      });
    }

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForBranch - COMPLETED`);

    return true;
  } catch (fetchErr) {
    logError(
      `[${transactionId}] [SERVICE] syncChatGroupForBranch - ERROR while syncing groups and users, reason: ${JSON.stringify(
        fetchErr.message,
      )}`,
    );

    throw fetchErr;
  }
};

/** Steps to sync chat group and user
 * 1. Retrieve data from OB user collection
 * 2. Retrieve data from chat-group-collection
 * 3. Retrieve QB data
 * 4. Compare user data
 * 5. If the data changes, do the necessary changes
 * 6. Delete individual chat groups if user is promoted from u1 to higher
 * 7. Remove the user from admin groups if user is demoted from admin to field
 */
const syncChatGroupForUser = async (transactionId: string, employeePsId: string): Promise<void> => {
  logInfo(`[${transactionId}] [SERVICE] syncChatGroupForUser initiated for user id ${employeePsId}`);

  try {
    const userInfo: OBUserSchemaType = await userService.getObUsersByPsId(transactionId, employeePsId);

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForUser - user retrieved`);

    if (!userInfo) {
      throw new Error('User Not Found!');
    }

    const quickBloxVendor = userInfo.vendorSystems.find(
      (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
    );

    if (!quickBloxVendor) {
      throw new Error('User Not Found in Quickblox!');
    }

    const [quickBloxId] = quickBloxVendor.vendorValue.split('|');

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForUser - user quickBloxId is ${quickBloxId}`);

    const usersChatGroupInfo = await getGroupUsersOB(transactionId, {
      employeePsId,
      quickBloxId,
      branchId: {
        $in: getEffectiveBranchIds(userInfo.branchAccess.overriddenBranchIds, userInfo.branchAccess.selectedBranchIds),
      },
      groupType: ChatGroupEnum.Group,
    });

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForUser - chat groups for user retrieved`);

    const [userInfoQB] = await listUsers(transactionId, { quickbloxIds: [quickBloxId] });

    const { canUpdate, updateFields } = compareUserDataChange(userInfo, userInfoQB);

    logInfo(
      `[${transactionId}] [SERVICE] syncChatGroupForUser - compared current onebayshore and previous quickblox user data, should update: ${canUpdate}`,
    );

    if (canUpdate) {
      await quickbloxUpdateUser(transactionId, updateFields);

      logInfo(`[${transactionId}] [SERVICE] syncChatGroupForUser - user updated in quickblox`);
    }

    const userBranchIds: string[] = getEffectiveBranchIds(
      userInfo.branchAccess.overriddenBranchIds,
      userInfo.branchAccess.selectedBranchIds,
    );

    for (const branchId of userBranchIds) {
      const currentJobLevelName = mapAccessLevelToName(updateFields.customData.accessLevel);
      const existingIndividualChatGroup = usersChatGroupInfo.find(
        (ele) => ele.branchId === branchId && ele.isGroupCreator,
      );

      if (currentJobLevelName === UserLevelEnum.BRANCH_ADMIN && existingIndividualChatGroup) {
        logInfo(`[${transactionId}] [SERVICE] syncChatGroupForUser - archive individual chat group`);

        await updateGroup(transactionId, existingIndividualChatGroup.groupId, {
          className: QBCustomClassNameEnum.GroupMetadata,
          isArchived: true,
        });

        await updateGroupUserOB(
          transactionId,
          {
            groupId: existingIndividualChatGroup.groupId,
          },
          {
            isArchived: true,
          },
        );

        logInfo(`[${transactionId}] [SERVICE] syncChatGroupForUser -  archive individual chat group COMPLETED`);
      } else if (currentJobLevelName === UserLevelEnum.FIELD_STAFF) {
        logInfo(`[${transactionId}] [SERVICE] syncChatGroupForUser - remove user from admin groups`);

        // Retrieve existing groups of a branch from QuickBlox
        let quickbloxGroups: QuickBloxChatGroupType[] = [];
        let hasMoreGroups = true;
        let skip = 0;

        while (hasMoreGroups) {
          const existingGroups = await listChatGroupsFromQuickblox(
            transactionId,
            { quickbloxIds: [quickBloxId], branchId, groupType: ChatGroupEnum.Group },
            { skip, limit: 100 },
          );

          quickbloxGroups = quickbloxGroups.concat(existingGroups);

          if (existingGroups.length < 100) {
            hasMoreGroups = false;
          } else {
            skip += 100;
          }
        }

        if (quickbloxGroups.length) {
          let filteredQuickbloxGroups = quickbloxGroups;

          if (existingIndividualChatGroup) {
            filteredQuickbloxGroups = quickbloxGroups.filter(
              (qbGroup) => qbGroup._id !== existingIndividualChatGroup.groupId,
            );
          }

          const removeUsersFromFilteredQBGroups = async (groups) => {
            const aggregatedRemoveQueryResults = await Promise.allSettled(
              groups.map((group) => removeUsersFromGroup(transactionId, group._id, [quickBloxId])),
            );

            aggregatedRemoveQueryResults.forEach((queryResult) => {
              if (queryResult.status === 'rejected') {
                logError(
                  `[${transactionId}] [SERVICE] syncChatGroupForUser - ERROR while removing admin from quickblox group, reason: ${queryResult.reason}`,
                );
              }
            });
          };

          await resolveByBatch(filteredQuickbloxGroups, 200, removeUsersFromFilteredQBGroups);

          logInfo(
            `[${transactionId}] [SERVICE] syncChatGroupForUser - remove user from admin quickblox groups COMPLETED`,
          );

          const removeObGroupsProcessFn = async (groups) => {
            const aggregatedRemoveQueryResults = await Promise.allSettled(
              groups.map((group) =>
                OBChatGroupModel.deleteMany({ groupId: group._id, quickBloxId, employeePsId, branchId }),
              ),
            );

            aggregatedRemoveQueryResults.forEach((queryResult) => {
              if (queryResult.status === 'rejected') {
                logError(
                  `[${transactionId}] [SERVICE] syncChatGroupForUser - ERROR while deleting onebayshore groups, reason: ${queryResult.reason}`,
                );
              }
            });
          };

          await resolveByBatch(filteredQuickbloxGroups, 300, removeObGroupsProcessFn);
        }
      }
    }

    if (canUpdate) {
      await Promise.allSettled(userBranchIds.map((branchId) => syncChatGroupForBranch(transactionId, branchId)));
    }

    logInfo(`[${transactionId}] [SERVICE] syncChatGroupForUser - SUCCESSFUL`);

    return;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] syncChatGroupForUser - ERROR while syncing user, reason: ${error.message}`);

    throw error;
  }
};

const getBranchChatGroups = async (
  transactionId: string,
  {
    employeePsId,
    branchIds,
    groupType,
    activeStatus,
    isGroupCreator,
    isArchived,
  }: {
    employeePsId: string;
    branchIds: string[];
    groupType: ChatGroupEnum;
    activeStatus: ActiveStateEnum;
    isGroupCreator: boolean;
    isArchived?: boolean;
  },
): Promise<OBChatGroupUserSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getBranchChatGroups for user and branch initiated, ${JSON.stringify({
      employeePsId,
      branchIds,
    })}`,
  );

  const filterQuery: FilterQuery<OBChatGroupUserSchemaType> = {
    employeePsId,
    branchId: {
      $in: branchIds,
    },
    groupType,
    isGroupCreator,
    activeStatus,
    ...(isArchived && { isArchived }),
    ...(!isArchived && {
      $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
    }),
  };

  return await getGroupUsersOB(transactionId, filterQuery);
};

const getChatGroupById = async (
  transactionId: string,
  groupId: string,
  { branchId, psId, isGroupCreator }: { branchId: string; psId?: string; isGroupCreator?: boolean },
): Promise<OBChatGroupUserSchemaType> => {
  logInfo(`[${transactionId}] [SERVICE] getChatGroupById for groupId: ${groupId} and branchId: ${branchId}`);

  const matchingChatGroup = await OBChatGroupModel.findOne({
    groupId,
    branchId,
    activeStatus: ActiveStateEnum.Active,
    ...(psId ? { employeePsId: psId } : null),
    ...(typeof isGroupCreator === 'boolean' ? { isGroupCreator } : null),
  });

  if (!matchingChatGroup) {
    logError(`[${transactionId}] [SERVICE] getChatGroupById FAILED for groupId: ${groupId} and branchId: ${branchId}`);

    throw new Error('Chat group not found');
  }

  return matchingChatGroup;
};

const backupGroupMessagesByBranchId = async (
  transactionId: string,
  branchId: string,
): Promise<{ groupsProcessed: number; messagesProcessed: number }> => {
  logInfo(`[${transactionId}] [SERVICE] Starting backup of QuickBlox messages for branchId: ${branchId}`);

  try {
    const groupLimit = 100;
    const maxInsertLimit = 1000;
    let numOfMsgsProcessed = 0;
    let numOfGroupsProcessed = 0;

    const groupSkipCacheKey = `qb_sync_branchId-${branchId}_groupSkipIndex`;

    // Retrieve current skip index from cache
    let groupSkip = 0;
    const cachedSkip = (await cacheService.retrieve(transactionId, {
      serviceName: 'chatService',
      identifier: groupSkipCacheKey,
    })) as { groupSkip?: number } | null;

    if (cachedSkip?.groupSkip > 0) {
      groupSkip = cachedSkip.groupSkip;
    }

    // Fetch a single page of QuickBlox groups
    const quickbloxGroups = await quickbloxListGroups(
      transactionId,
      { branchId },
      { skip: groupSkip, limit: groupLimit },
    );

    if (quickbloxGroups.length === 0) {
      logInfo(
        `[${transactionId}] [SERVICE] No more QuickBlox groups found for branchId: ${branchId}. Resetting index...`,
      );

      await cacheService.persist(transactionId, {
        serviceName: 'chatService',
        identifier: groupSkipCacheKey,
        data: { groupSkip: 0, branchId },
        expires: '1d',
      });

      return {
        groupsProcessed: 0,
        messagesProcessed: 0,
      };
    }

    logInfo(`[${transactionId}] [SERVICE] Found ${quickbloxGroups.length} QuickBlox groups to process.`);

    for (const group of quickbloxGroups) {
      numOfGroupsProcessed += 1;

      const cacheIdentifier = `qb_sync_branchId-${branchId}_groupId-${group._id}_msg`;
      const cacheEmptyTrackerIdentifier = `qb_sync_empty_msg_branchId-${branchId}_groupId-${group._id}_msg`;
      const cachedData = (await cacheService.retrieve(transactionId, {
        serviceName: 'chatService',
        identifier: cacheIdentifier,
      })) as { lastMessageId?: string } | null;

      const isEmpty = await cacheService.retrieve(transactionId, {
        serviceName: 'chatService',
        identifier: cacheEmptyTrackerIdentifier,
      });

      if (isEmpty) {
        continue;
      }

      let lastMessageId = cachedData?.lastMessageId;
      let hasMoreMessages = true;

      while (hasMoreMessages && numOfMsgsProcessed < maxMessageProcessLimit) {
        const messages = await getGroupMessages(transactionId, group._id, {
          lastMessageId,
          limit: maxInsertLimit,
          sort: 'asc',
        });

        if (messages?.length === 0) {
          logInfo(`[${transactionId}] [SERVICE] No more messages for group ${group._id}.`);

          await cacheService.persist(transactionId, {
            serviceName: 'chatService',
            identifier: cacheEmptyTrackerIdentifier,
            data: { branchId, groupId: group._id, interactedAt: Date.now() },
            expires: '1d',
          });
          hasMoreMessages = false;
          continue;
        }

        const sanitizedMessages = messages.map((message) => mapQuickBloxMessageToBackup(transactionId, message));

        logInfo(`[${transactionId}] [SERVICE] Inserting ${sanitizedMessages.length} messages for group ${group._id}.`);

        if (sanitizedMessages.length > 0) {
          await bulkInsertQuickBloxMessages(transactionId, sanitizedMessages, maxInsertLimit);

          logInfo(
            `[${transactionId}] [SERVICE] Successfully inserted ${sanitizedMessages.length} messages for group ${group._id}.`,
          );

          lastMessageId = sanitizedMessages[sanitizedMessages.length - 1]._id;

          await cacheService.persist(transactionId, {
            serviceName: 'chatService',
            identifier: cacheIdentifier,
            data: { lastMessageId, branchId, groupId: group._id, interactedAt: Date.now() },
            expires: '60d',
          });

          numOfMsgsProcessed += sanitizedMessages.length;
          logInfo(
            `[${transactionId}] [SERVICE] Processed ${numOfMsgsProcessed}/${maxMessageProcessLimit} messages so far.`,
          );
        }
      }

      if (numOfMsgsProcessed >= maxMessageProcessLimit) {
        logInfo(
          `[${transactionId}] [SERVICE] Reached maxMessageProcessLimit (${maxMessageProcessLimit}), stopping further processing.`,
        );
        break;
      }
    }

    // Update skip index in cache for next run
    await cacheService.persist(transactionId, {
      serviceName: 'chatService',
      identifier: groupSkipCacheKey,
      data: { groupSkip: groupSkip + quickbloxGroups.length },
      expires: '1d',
    });

    logInfo(
      `[${transactionId}] [SERVICE] Backup completed for branchId: ${branchId}. Groups processed: ${numOfGroupsProcessed}, Messages processed: ${numOfMsgsProcessed}`,
    );

    return {
      groupsProcessed: numOfGroupsProcessed,
      messagesProcessed: numOfMsgsProcessed,
    };
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] Backup failed for branchId: ${branchId} - ${error.message}`);
    throw error;
  }
};

const mapQuickBloxMessageToBackup = (
  transactionId: string,
  message: QuickBloxMessageType,
): OBQuickBloxMessageBackupSchemaType => {
  logInfo(`[${transactionId}] [SERVICE] mapQuickBloxMessageToBackup - mapping message ${message._id}`);

  try {
    const dateSent =
      typeof message.date_sent === 'number'
        ? new Date(message.date_sent * 1000)
        : message.date_sent
        ? new Date(message.date_sent)
        : new Date(message.created_at);

    return {
      _id: message._id,
      chatDialogId: message.chat_dialog_id,
      createdAt: new Date(message.created_at),
      dateSent,
      senderId: message?.sender_id ? message.sender_id.toString() : null,
      customSenderId: message.customSenderId || undefined,
      recipientId: message?.recipient_id ? message.recipient_id.toString() : null,
      message: message?.message,
      messageType: message?.messageType,
      attachments:
        message?.attachments && message.attachments.length > 0
          ? message.attachments.map((att) => ({
              type: att.type,
              id: att.id,
            }))
          : [],
      updatedAt: message.updated_at ? new Date(message.updated_at) : null,
      deliveredIds:
        message?.delivered_ids && message.delivered_ids.length > 0
          ? message.delivered_ids.map((id) => id.toString())
          : [],
      readIds: message?.read_ids && message.read_ids.length > 0 ? message.read_ids.map((id) => id.toString()) : [],
      allRead: message?.all_read,
      markable: message?.markable,
      read: message.read?.toString(),
    };
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] mapQuickBloxMessageToBackup - ERROR while mapping message, reason: ${error.message}`,
    );
    throw error;
  }
};

const bulkInsertQuickBloxMessages = async (
  transactionId: string,
  messages: OBQuickBloxMessageBackupSchemaType[],
  batchSize = 200,
): Promise<boolean> => {
  logInfo(`[${transactionId}] [SERVICE] bulkInsertQuickBloxMessages - initiated for ${messages.length} messages`);

  try {
    if (!messages || messages.length === 0) {
      logInfo(`[${transactionId}] [SERVICE] bulkInsertQuickBloxMessages - no messages to insert`);

      return true;
    }

    // Process in batches
    const batches = chunkArray(messages, batchSize);

    let insertedCount = 0;

    for (const batch of batches) {
      const result = await OBQuickBloxMessageBackupModel.insertMany(batch, { ordered: false });
      insertedCount += result.length;

      logInfo(
        `[${transactionId}] [SERVICE] bulkInsertQuickBloxMessages - processed batch of ${
          batch.length
        } messages, inserted: ${result.length}, failed: ${batch.length - result.length}`,
      );
    }

    logInfo(
      `[${transactionId}] [SERVICE] bulkInsertQuickBloxMessages - COMPLETED, total messages processed: ${messages.length}, inserted: ${insertedCount}`,
    );

    return true;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] bulkInsertQuickBloxMessages - ERROR while inserting messages, reason: ${error.message}`,
    );
    throw error;
  }
};

export {
  getChatGroupsByFilter,
  listChatGroupsFromQuickblox,
  checkValidUsersInQuickBlox,
  createMultipleGroups,
  syncChatGroupForBranch,
  syncChatGroupForUser,
  getQbUsersByEmails,
  createQBUser,
  getBranchChatGroups,
  updateGroupUserOB,
  deleteGroupUserOB,
  getChatGroupById,
  backupGroupMessagesByBranchId,
};
