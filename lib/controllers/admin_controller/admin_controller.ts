import { NextFunction } from 'connect';
import express from 'express';
import mongoose from 'mongoose';
import { IAppConfig } from '../../config';
import {
  HttpStatusCode,
  PrerequisiteStepEnum,
  MongoCollection,
  VendorExternalEnum,
  AudienceEnum,
  NotificationPlacementEnum,
  NotificationOriginEnum,
  NotificationTypeEnum,
  PriorityEnum,
  ScreenEnum,
  ActiveStateEnum,
  ChatGroupEnum,
  UserStatusEnum,
} from '../../enums';
import { logError, logInfo, logWarn } from '../../log/util';
import { onebayshoreInternalApiMiddleware } from '../../middlewares';
import {
  cacheService,
  chatService,
  onboardUserService,
  userService,
  anonymizedInfoService,
  notificationService,
  chatV2Service,
  locationService,
} from '../../services';
import {
  OBProfileUpsertOperationType,
  OBUserSchemaType,
  QuickBloxUserType,
  QuickbloxUserUpsertOperationType,
  JSONLikeType,
  OBChatV2UserSchemaType,
} from '../../types';
import { addDays, getEffectiveJobRole, isValidDate, quickbloxIdentityHelper, resolveByBatch } from '../../utils';
import { BaseController } from '../base_controller';

type AdminActionApiInputType = {
  actionType:
    | 'clear-cache'
    | 'sync-db'
    | 'align-prerequisites'
    | 'get-branch-users'
    | 'sync-branch-users-chat'
    | 'branch-chat-report'
    | 'branch-chat-report-detailed'
    | 'sync-branch-users-quickblox'
    | 'sync-job-level'
    | 'drop-collection'
    | 'get-failed-logins'
    | 'get-collection-data'
    | 'notify-user'
    | 'change-user-status'
    | 'reset-chat-profile'
    | 'backup-qb-messages'
    | 'chat_v2/sync/branch-users-access'
    | 'chat_v2/sync/user'
    | 'chat_v2/sync/system-groups';
  payload?: {
    [key: string]: string | string[] | number | number[] | boolean | { [key: string]: any } | null;
  };
};

type AdminActionPayloadType = {
  message: string;
  details?: JSONLikeType;
};

export class AdminController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/admin`;
    this.router = express.Router();
    this.router.use(this.basePath, onebayshoreInternalApiMiddleware);
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.post(`${this.basePath}`, this.asyncHandler(this.adminAction.bind(this)));
  }

  private syncDbAction = async (
    transactionId: string,
    collectionName: MongoCollection,
  ): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] syncDbAction initiated for ${collectionName}`);

    const allowedCollectionToBeSyncedNames = [
      MongoCollection.OneBayshoreNewsFeedCollection,
      MongoCollection.OneBayshoreMilestonesCollection,
      MongoCollection.OneBayshoreJobBoardCollection,
    ];

    if (!Object.values(MongoCollection).includes(collectionName)) {
      logError(`[${transactionId}] [CONTROLLER] [adminAction] syncDbAction unFound collectionName: ${collectionName}`);

      throw new Error('Unknown collection name provided');
    }

    if (!allowedCollectionToBeSyncedNames.includes(collectionName)) {
      logError(
        `[${transactionId}] [CONTROLLER] [adminAction] syncDbAction unauthorized sync attempt for collectionName: ${collectionName}`,
      );

      throw new Error(`Unauthorized to sync ${collectionName}`);
    }

    const Model = mongoose.model(collectionName);

    const syncResults = await Promise.allSettled([Model.syncIndexes()]);

    const results: string[] = [];

    syncResults.forEach((syncResult) => {
      if (syncResult.status === 'rejected') {
        results.push(syncResult.reason);

        return;
      }
      results.push('Successful sync');
    });

    return {
      details: { syncedDbResults: results },
      message: 'Databases synced successfully',
    };
  };

  private clearCacheAction = async (transactionId: string): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] clearCacheAction initiated`);

    await cacheService.clearAll(transactionId);

    return {
      message: 'Cache cleared successfully',
      details: null,
    };
  };

  private clearCacheForUserAction = async (
    transactionId: string,
    userPsId: string,
  ): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] clearCacheForUserAction initiated for psId: ${userPsId}`);

    await Promise.allSettled([
      cacheService.remove(transactionId, {
        serviceName: 'employeeService',
        identifier: userPsId,
      }),
      cacheService.remove(transactionId, {
        serviceName: 'procuraEmployeeService',
        identifier: userPsId,
      }),
      cacheService.remove(transactionId, {
        serviceName: 'userService',
        identifier: userPsId,
      }),
      cacheService.remove(transactionId, {
        serviceName: 'clientService',
        identifier: userPsId,
      }),
    ]);

    return {
      message: 'Cache cleared successfully',
      details: { psId: userPsId },
    };
  };

  private alignPrerequisitesAction = async (
    transactionId: string,
    { prerequisiteId, employeePsIds }: { prerequisiteId: string; employeePsIds?: string[] },
  ): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] alignPrerequisitesAction initiated`);

    if (
      !prerequisiteId ||
      (prerequisiteId.toUpperCase() !== PrerequisiteStepEnum.Sspr.toUpperCase() && !prerequisiteId.startsWith('PreReq'))
    ) {
      throw new Error('Please provide a valid prerequisite and employeePsIds to align for the users');
    }

    let totalSyncCount: number;

    if (Array.isArray(employeePsIds)) {
      const { syncUserCount } = await onboardUserService.alignPrerequisiteByPsIds(
        transactionId,
        prerequisiteId,
        employeePsIds,
      );

      totalSyncCount = syncUserCount;
    } else {
      const { syncUserCount } = await onboardUserService.alignPrerequisiteForAllUsersByPrereqId(
        transactionId,
        prerequisiteId,
      );

      totalSyncCount = syncUserCount;
    }

    return {
      message: 'Prerequisite alignment successful',
      details: {
        syncedUsers: totalSyncCount,
        prerequisiteId,
      },
    };
  };

  private getUsersByBranchId = async (
    transactionId: string,
    branchId: string,
    { skip, limit } = { skip: 0, limit: 100 },
  ): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] getUsersByBranchId initiated`);

    if (!branchId) {
      throw new Error('Please provide a valid branchId to get the users');
    }

    const users: unknown = await userService.getObUsersByBranchIds(transactionId, [branchId], [1, 2, 3, 4, 5], {
      skip,
      limit,
    });

    return {
      message: `Users from ${branchId}`,
      details: users as JSONLikeType,
    };
  };

  private syncChatGroupsForUsersByBranchId = async (
    transactionId: string,
    branchId: string,
  ): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] syncChatGroupsForUsersByBranchId initiated`);

    if (!branchId) {
      throw new Error('Please provide a valid branchId to sync the chat');
    }

    let totalUsers: OBUserSchemaType[] = [];
    let hasMoreUsers = true;
    let skip = 0;

    while (hasMoreUsers) {
      const users = await userService.getObUsersByBranchIds(transactionId, [branchId], [1, 2, 3, 4, 5], {
        skip,
        limit: 100,
      });

      totalUsers = totalUsers.concat(users);

      if (users.length < 100) {
        hasMoreUsers = false;
      } else {
        skip += 100;
      }
    }

    logInfo(
      `[${transactionId}] [SERVICE] syncChatGroupsForUsersByBranchId - users retrieved for branch: ${branchId}, total users: ${totalUsers.length}`,
    );

    const aggregatedGroupQueryResults = await Promise.allSettled(
      totalUsers.map(({ employeePsId }) => chatService.syncChatGroupForUser(transactionId, employeePsId)),
    );

    aggregatedGroupQueryResults.forEach((result) => {
      if (result.status === 'rejected') {
        logError(
          `[${transactionId}] [SERVICE] syncChatGroupsForUsersByBranchId - FAILED for user, reason: ${result.reason}`,
        );
      }
    });

    return { message: `Users synced for branchId: ${branchId}` };
  };

  private syncQuickbloxUsersByBranch = async (
    transactionId: string,
    branchId: string,
    maxUserLimitToSync = 300,
  ): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] syncQuickbloxUsersByBranch initiated`);

    if (!branchId) {
      throw new Error('Please provide a valid branchId to sync the users');
    }

    const users = await userService.getObUsersByFilter(
      transactionId,
      {
        'branchAccess.selectedBranchIds': {
          $in: [branchId],
        },
        'vendorSystems.vendorValue': {
          $regex: 'UNK_ID',
        },
      },
      { skip: 0, limit: maxUserLimitToSync },
    );

    logInfo(
      `[${transactionId}] [CONTROLLER] syncChatGroupsForUsersByBranchId - users retrieved for branch: ${branchId}, total users: ${users.length}`,
    );

    if (users.length === 0) {
      return { message: `Users synced for branchId: ${branchId}` };
    }

    const quickBloxUsers = await chatService.getQbUsersByEmails(
      transactionId,
      users.map(({ workEmail }) => workEmail),
    );

    const quickBloxUsersHash: { [email: string]: QuickBloxUserType } = {};

    quickBloxUsers.forEach((user) => {
      quickBloxUsersHash[user.email] = user;
    });

    logInfo(
      `[${transactionId}] [CONTROLLER] syncChatGroupsForUsersByBranchId - users retrieved from quickblox, total users: ${quickBloxUsers.length}`,
    );

    const updateUsersInfo: Partial<OBProfileUpsertOperationType>[] = [];
    const createUsersInfo: QuickbloxUserUpsertOperationType[] = [];

    users.forEach((user) => {
      const quickBloxId = quickBloxUsersHash[user.workEmail]?.id;

      if (quickBloxId) {
        const vendorSystem = user.vendorSystems.find(
          (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
        );

        const [, quickBloxPassword] = quickbloxIdentityHelper.fromStorage(vendorSystem.vendorValue);

        updateUsersInfo.push({
          psId: user.employeePsId,
          vendors: {
            quickBloxId: quickBloxId.toString(),
            quickBloxPassword,
          },
        });
      } else {
        createUsersInfo.push({
          email: user.workEmail,
          displayName: user.displayName,
          customData: {
            psId: user.employeePsId,
            accessLevel: user.obAccess.level,
            branchIds: user.branchAccess.selectedBranchIds,
            jobCode: user.job.code,
            jobLevel: user.job.level,
            jobId: user.job.jobId,
            profileImage: user.tempProfile?.tempProfileImgUrl,
          },
        });
      }
    });

    if (createUsersInfo.length) {
      const processFn = async (createUsers: QuickbloxUserUpsertOperationType[]) => {
        const aggregatedUsersQueryResult = await Promise.allSettled(
          createUsers.map((user) => chatService.createQBUser(transactionId, user)),
        );

        aggregatedUsersQueryResult.forEach((userQueryResult) => {
          if (userQueryResult.status === 'rejected') {
            logError(
              `[${transactionId}] [CONTROLLER] syncChatGroupsForUsersByBranchId - ERROR while creating user, reason: ${userQueryResult.reason}`,
            );
          }
        });
      };

      await resolveByBatch(createUsersInfo, 10, processFn);
    }

    if (!updateUsersInfo.length) {
      return { message: `Users synced for branchId: ${branchId}` };
    }

    logInfo(`[${transactionId}] [CONTROLLER] syncChatGroupsForUsersByBranchId - update users initiated`);

    const processFn = async (updateUsers: Partial<OBProfileUpsertOperationType>[]) => {
      const aggregatedUpdatedUsersQueryResult = await Promise.allSettled(
        updateUsers.map((user) => userService.updateUserByPsId(transactionId, user)),
      );

      aggregatedUpdatedUsersQueryResult.forEach((userQueryResult) => {
        if (userQueryResult.status === 'rejected') {
          logError(
            `[${transactionId}] [CONTROLLER] syncChatGroupsForUsersByBranchId - ERROR while updating user in mongo, reason: ${userQueryResult.reason}`,
          );
        }
      });
    };

    await resolveByBatch(updateUsersInfo, 100, processFn);

    return { message: `Users synced with quickblox for branchId: ${branchId}` };
  };

  private getFailedLoginsByDate = async (
    transactionId: string,
    startDate: Date,
    endDate?: Date,
  ): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] getFailedLoginsByDate initiated`);

    const failedLogins: unknown = await anonymizedInfoService.getFailedLoginsByDate(transactionId, {
      attemptStartDate: startDate,
      attemptEndDate: endDate,
    });

    return {
      message: `Failed logins between "${startDate.toISOString()}" and "${endDate?.toISOString()}"`,
      details: failedLogins as JSONLikeType,
    };
  };

  /**
   * Use it with caution
   */
  private dropSelectedCollection = async (
    transactionId: string,
    collectionName: MongoCollection,
  ): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] dropSelectedCollection initiated`);

    const allowedCollectionToBeDroppedNames = [
      MongoCollection.OneBayshoreChatV2GroupCollection,
      MongoCollection.OneBayshoreChatV2UserCollection,
    ];

    if (!Object.values(MongoCollection).includes(collectionName)) {
      logError(
        `[${transactionId}] [CONTROLLER] [adminAction] dropSelectedCollection unFound collectionName: ${collectionName}`,
      );

      throw new Error('Unknown collection name provided');
    }

    if (!allowedCollectionToBeDroppedNames.includes(collectionName)) {
      logError(
        `[${transactionId}] [CONTROLLER] [adminAction] dropSelectedCollection unauthorized drop attempt for collectionName: ${collectionName}`,
      );

      throw new Error(`Unauthorized to drop ${collectionName}`);
    }

    const Model = mongoose.model(collectionName);

    await Model.collection.dropIndexes();
    await Model.collection.drop();

    logWarn(
      `[${transactionId}] [CONTROLLER] [adminAction] dropSelectedCollection DROPPED collectionName: ${collectionName}`,
    );

    return {
      message: `${collectionName} dropped successfully`,
    };
  };

  private getCollectionData = async (
    transactionId: string,
    collectionName: MongoCollection,
    options: {
      skip: number;
      limit: number;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] getCollectionData initiated`);

    const excludedCollectionNames = [
      MongoCollection.OneBayshoreUserCollection,
      MongoCollection.OneBayshoreWellnessNoteCollection,
      MongoCollection.OneBayshoreUserLocationCollection,
    ];

    if (!Object.values(MongoCollection).includes(collectionName)) {
      logError(
        `[${transactionId}] [CONTROLLER] [adminAction] getCollectionData unFound collectionName: ${collectionName}`,
      );

      throw new Error('Unknown collection name provided');
    }

    if (excludedCollectionNames.includes(collectionName)) {
      logError(
        `[${transactionId}] [CONTROLLER] [adminAction] getCollectionData unauthorized access attempt for collectionName: ${collectionName}`,
      );

      throw new Error(`Unauthorized access to ${collectionName}`);
    }

    const Model = mongoose.model(collectionName);

    const dataCursor = Model.find()
      .sort({
        [options.sortField ?? 'createdAt']: options.sortOrder === 'asc' ? 1 : -1,
      })
      .skip(options.skip)
      .limit(options.limit)
      .cursor();

    const records: JSONLikeType[] = [];

    for await (const record of dataCursor) {
      records.push(record.toJSON());
    }
    const totalDocumentCount = await Model.estimatedDocumentCount();

    return {
      message: `${collectionName} retrieved for skip: ${options.skip} and limit: ${options.limit}`,
      details: {
        totalCount: totalDocumentCount,
        data: records,
      },
    };
  };

  private notifyUserByPsIds = async (
    transactionId: string,
    psIds: string[],
    {
      title,
      body,
      placements,
      expiresAt,
      isClearable,
      redirectionParams,
    }: {
      title: string;
      body: string;
      expiresAt: Date;
      placements?: string[];
      isClearable?: boolean;
      redirectionParams?: JSONLikeType;
    },
  ): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] notifyUserByPsIds initiated`);

    const notificationPlacements: NotificationPlacementEnum[] = [];

    if (!Array.isArray(placements) || placements.length === 0) {
      notificationPlacements.push(NotificationPlacementEnum.Push);
    } else {
      if (placements.includes('push')) {
        notificationPlacements.push(NotificationPlacementEnum.Push);
      }
      if (placements.includes('dashboard')) {
        notificationPlacements.push(NotificationPlacementEnum.Dashboard);
      }
      if (placements.includes('userQueue')) {
        notificationPlacements.push(NotificationPlacementEnum.UserQueue);
      }
    }

    const redirectionDetails: {
      redirectionScreen?: ScreenEnum;
      redirectionScreenProps?: JSONLikeType;
    } = {};

    if (redirectionParams) {
      if (redirectionParams.resourceUrl && redirectionParams.mediaType) {
        redirectionDetails.redirectionScreen = ScreenEnum.ResourceDetailScreen;
        redirectionDetails.redirectionScreenProps = {
          resourceUrl: redirectionParams.resourceUrl,
          mediaType: redirectionParams.mediaType,
        };
      }

      if (redirectionParams.pollId && redirectionParams.pollTitle) {
        redirectionDetails.redirectionScreen = ScreenEnum.PollScreen;
        redirectionDetails.redirectionScreenProps = {
          resourceUrl: redirectionParams.resourceUrl,
          mediaType: redirectionParams.mediaType,
        };
      }
    }

    const notificationId = await notificationService.sendNotification(transactionId, {
      audienceLevel: AudienceEnum.Individual,
      userPsIds: psIds,
      notificationTitle: title,
      notificationBody: body,
      notificationPlacements,
      notificationOrigin: NotificationOriginEnum.System,
      notificationType: NotificationTypeEnum.Individual,
      notificationVisibility: AudienceEnum.Individual,
      priority: PriorityEnum.High,
      isClearable,
      ...redirectionDetails,
      expiresAt,
    });

    return {
      message: 'Notifications attempted successfully',
      details: {
        notificationId,
      },
    };
  };

  private syncChatV2GroupsForUsersByBranchId = async (
    transactionId: string,
    branchId: string,
  ): Promise<AdminActionPayloadType> => {
    logInfo(
      `[${transactionId}] [CONTROLLER] [adminAction] syncChatV2GroupsForUsersByBranchId initiated for branchId: ${branchId}`,
    );

    await chatV2Service.syncChatUserAccessForBranch(transactionId, branchId);

    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] syncChatV2GroupsForUsersByBranchId completed SUCCESSFULLY`);

    return {
      message: `Synced ACS access for the branch users of branch: ${branchId}`,
      details: {
        branchId,
      },
    };
  };

  private syncChatV2User = async (
    transactionId: string,
    psId: string,
    branchId: string,
  ): Promise<AdminActionPayloadType> => {
    logInfo(
      `[${transactionId}] [CONTROLLER] [adminAction] syncChatV2User initiated for psId: ${psId}, branchId: ${branchId}`,
    );

    await chatV2Service.syncBranchChatAbility(transactionId, psId, branchId);

    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] syncChatV2User completed SUCCESSFULLY`);

    return {
      message: `Synced ACS access for the user: ${psId}`,
      details: {
        psId,
        branchId,
      },
    };
  };

  private syncChatV2SystemGroups = async (transactionId: string, branchId: string): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] syncChatV2SystemGroups initiated for branchId: ${branchId}`);

    await chatV2Service.syncSystemChatGroupsForBranch(transactionId, branchId);

    return {
      message: `Synced System Groups for the branchId: ${branchId}`,
      details: {
        branchId,
      },
    };
  };

  private resetChatProfiles = async (transactionId: string, psIds: string[]): Promise<AdminActionPayloadType> => {
    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] resetChatProfiles initiated`);

    const results = await Promise.allSettled(
      psIds.map((psId) => chatV2Service.resetChatUserProfile(transactionId, psId)),
    );

    const successfulResets: string[] = [];

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successfulResets.push(result.value);
      }
    });

    return {
      message: `${successfulResets.length > 0 ? 'Successful' : 'Failed'} profiles reset!`,
      details: {
        successfulResets,
      },
    };
  };

  private backupQBMessagesByBranch = async (
    transactionId: string,
    branchId: string,
  ): Promise<AdminActionPayloadType> => {
    let message = '';
    let messagesBackedUpCount = 0;
    let totalGroupsProcessed = 0;

    try {
      logInfo(`[${transactionId}] [CONTROLLER] [adminAction] [backupQBMessagesByBranch] Backup process initiated`);

      if (!branchId) {
        throw new Error('Branch ID is required for message backup!');
      }

      const { groupsProcessed, messagesProcessed } = await chatService.backupGroupMessagesByBranchId(
        transactionId,
        branchId,
      );
      messagesBackedUpCount = messagesProcessed;
      totalGroupsProcessed = groupsProcessed;

      logInfo(
        `[${transactionId}] [CONTROLLER] [adminAction] [backupQBMessagesByBranch] ${messagesBackedUpCount} messages backed up for branch ID: ${branchId}`,
      );
    } catch (backupErr) {
      logError(
        `[${transactionId}] [CONTROLLER] [adminAction] [backupQBMessagesByBranch] FAILED for branchId: ${branchId}, reason: ${backupErr.message}`,
      );
    } finally {
      message =
        messagesBackedUpCount > 0
          ? `Backup successful. ${messagesBackedUpCount} messages were backed up for branch ID: ${branchId}.`
          : `No new messages required backup for branch ID: ${branchId}. All messages are already up to date.`;
    }

    return {
      message,
      details: {
        backedUp: messagesBackedUpCount,
        totalGroupsProcessed,
      },
    };
  };

  private getChatV2GroupDetailedReportByBranchId = async (
    transactionId: string,
    groupId: string,
    branchId: string,
  ): Promise<AdminActionPayloadType> => {
    try {
      const branch = await locationService.getBranchDetailsById(transactionId, branchId);

      if (!branch?.branchId) {
        throw new Error(`Branch not found for branchId: ${branchId}`);
      }

      const chatGroup = await chatV2Service.getChatGroupByGroupId(transactionId, groupId, branchId);

      if (!chatGroup) {
        throw new Error(`[Admin] Chat Group not found for groupId: ${groupId} and branchId: ${branch.branchId}`);
      }

      if (chatGroup.branchId !== branch.branchId) {
        logWarn(
          `[${transactionId}] [CONTROLLER] [adminAction] getChatV2GroupDetailedReportByBranchId - branchId mismatch for groupId: ${groupId}, expected: ${branch.branchId}, found: ${chatGroup.branchId}`,
        );
      }

      const [obUsers, chatGroupWithVendorUsers] = await Promise.all([
        // Fetch OB Users in Branch
        userService.getObUsersByBranchIds(transactionId, [branchId], [1, 2, 3, 4, 5], {
          activeOnly: false,
          skip: 0,
          limit: 1000,
        }),
        // Fetch Chat Group Users
        chatV2Service.getChatVendorGroupUsers(transactionId, groupId, branchId),
      ]);

      const chatGroupUserMap = new Map<string, OBChatV2UserSchemaType & { isUserPresentInVendor: boolean }>();

      for (const groupUser of chatGroupWithVendorUsers) {
        chatGroupUserMap.set(groupUser.employeePsId, groupUser);
      }

      const branchChatUsers = [];

      obUsers.forEach((obUser) => {
        const chatGroupUser = chatGroupUserMap.get(obUser.employeePsId);

        const currentJob = getEffectiveJobRole(obUser.obAccess, obUser.job);

        let chatUserHealth = 'Unhealthy';

        if (obUser.activeStatus === UserStatusEnum.Active && chatGroupUser?.activeStatus === obUser.activeStatus) {
          chatUserHealth = 'Healthy';
        }

        if (
          chatGroup.groupType === ChatGroupEnum.DirectMessage &&
          currentJob.level === 1 &&
          obUser.employeePsId !== chatGroup.intendedForPsId
        ) {
          chatUserHealth = 'Irrelevant';
        }

        branchChatUsers.push({
          employeePsId: obUser.employeePsId,
          displayName: obUser.displayName,
          jobLevel: currentJob.level,
          jobTitle: currentJob.code,
          activeStatus: obUser.activeStatus,
          lastLoggedAt: obUser.lastLoggedAt,
          hasVendorUserId:
            (obUser.vendorSystems || []).some((vendor) => vendor.vendorId === VendorExternalEnum.Azure) ?? false,
          groupUserStatus: chatGroupUser?.activeStatus ?? null,
          expectedChatStatus: chatUserHealth,
          isUserPresentInVendor: chatGroupUser?.isUserPresentInVendor ?? null,
          userCreatedAt: obUser.createdAt,
          userUpdatedAt: obUser.updatedAt,
          userLoggedAt: obUser.lastLoggedAt,
          groupUserCreatedAt: chatGroupUser?.createdAt ?? null,
          groupUserUpdatedAt: chatGroupUser?.updatedAt ?? null,
        });
      });

      const actionResults = {
        branchChatGroupInfo: {
          branchId: chatGroup.branchId,
          branchName: branch.branchName,
          groupId: chatGroup.groupId,
          groupName: chatGroup.groupName,
          groupType: chatGroup.groupType,
          groupStatus: chatGroup.activeStatus,
          intendedForPsId: chatGroup.intendedForPsId,
          groupMeta: chatGroup.accessControlMeta,
          groupMetrics: chatGroup.metricsMeta,
          groupCreatedAt: chatGroup.createdAt,
          groupUpdatedAt: chatGroup.updatedAt,
        },
        branchChatUsers,
      };

      return {
        message: 'Fetched branch detailed chat report successfully',
        details: actionResults as unknown as JSONLikeType,
      };
    } catch (reportErr) {
      logError(
        `[${transactionId}] [CONTROLLER] [adminAction] getChatV2GroupDetailedReportByBranchId FAILED for groupId: ${groupId}, reason: ${reportErr.message}`,
      );

      return {
        message: `Failed to fetch branch detailed chat report for groupId: ${groupId} and branchId: ${branchId}`,
        details: null,
      };
    }
  };

  private adminAction = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] [adminAction] Admin action initiated`);

    let actionResults: unknown = null;
    let actionMessage = 'No matching action type!';
    let isActionSuccessful = false;

    try {
      const { actionType, payload } = request.body as AdminActionApiInputType;

      logInfo(`[${transactionId}] [CONTROLLER] [adminAction] provided action type: ${actionType}`);

      if (actionType === 'reset-chat-profile' && Array.isArray(payload?.psIds)) {
        const { message, details } = await this.resetChatProfiles(transactionId, payload.psIds as string[]);

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (actionType === 'backup-qb-messages' && typeof payload?.branchId === 'string') {
        const { message, details } = await this.backupQBMessagesByBranch(transactionId, payload.branchId);

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (actionType === 'sync-db' && typeof payload?.collectionName === 'string') {
        const { message, details } = await this.syncDbAction(transactionId, payload.collectionName as MongoCollection);

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (actionType === 'clear-cache' && typeof payload?.psId === 'string') {
        const { message } = await this.clearCacheForUserAction(transactionId, payload.psId as string);

        isActionSuccessful = true;
        actionMessage = message;
      }

      if (actionType === 'align-prerequisites' && typeof payload?.prerequisiteId === 'string') {
        const { message, details } = await this.alignPrerequisitesAction(
          transactionId,
          payload as { prerequisiteId: string; employeePsIds: string[] },
        );

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (actionType === 'get-branch-users' && typeof payload?.branchId === 'string') {
        const { message, details } = await this.getUsersByBranchId(transactionId, payload.branchId, {
          skip: (payload?.skip as number) ?? 0,
          limit: (payload?.limit as number) ?? 100,
        });

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (actionType === 'sync-branch-users-chat' && typeof payload?.branchId === 'string') {
        const { message } = await this.syncChatGroupsForUsersByBranchId(transactionId, payload.branchId);

        isActionSuccessful = true;
        actionMessage = message;
      }

      if (actionType === 'branch-chat-report' && typeof payload?.branchId === 'string') {
        const chatGroups = await chatV2Service.getChatGroupsByBranchIds(
          transactionId,
          [payload.branchId],
          payload.groupTypes as ChatGroupEnum[] | undefined,
        );

        isActionSuccessful = true;
        actionMessage = 'Fetched branch chat groups successfully';
        actionResults = chatGroups;
      }

      if (
        actionType === 'branch-chat-report-detailed' &&
        typeof payload?.branchId === 'string' &&
        typeof payload?.groupId === 'string'
      ) {
        const { message, details } = await this.getChatV2GroupDetailedReportByBranchId(
          transactionId,
          payload.groupId,
          payload.branchId,
        );

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (actionType === 'sync-branch-users-quickblox' && typeof payload?.branchId === 'string') {
        const { message } = await this.syncQuickbloxUsersByBranch(
          transactionId,
          payload.branchId,
          payload.maxUserLimitToSync ? +payload.maxUserLimitToSync : 300,
        );

        isActionSuccessful = true;
        actionMessage = message;
      }

      if (actionType === 'sync-job-level' && typeof payload?.branchId === 'string') {
        const totalUpdatedCount = await userService.syncJobLevelForBranchId(transactionId, payload.branchId);

        isActionSuccessful = true;
        actionMessage = `User job level synced for ${totalUpdatedCount} users for branchId: ${payload.branchId}`;
      }

      if (actionType === 'drop-collection' && typeof payload?.collectionName === 'string') {
        const { message } = await this.dropSelectedCollection(transactionId, payload.collectionName as MongoCollection);

        isActionSuccessful = true;
        actionMessage = message;
      }

      if (actionType === 'get-collection-data' && typeof payload?.collectionName === 'string') {
        const { collectionName } = payload;

        const skip = (payload?.skip as number) ?? 0;
        const limit = (payload?.limit as number) ?? 100;

        const sortQuery: {
          sortField: string;
          sortOrder: 'asc' | 'desc';
        } = {
          sortField: 'createdAt',
          sortOrder: 'desc',
        };
        if (payload.sortField) {
          sortQuery.sortField = payload.sortField as string;
        }

        if (['asc', 'desc'].includes(`${payload.sortOrder}`)) {
          sortQuery.sortOrder = `${payload.sortOrder}` as 'asc' | 'desc';
        }

        const { message, details } = await this.getCollectionData(transactionId, collectionName as MongoCollection, {
          skip,
          limit,
          ...sortQuery,
        });

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (
        actionType === 'get-failed-logins' &&
        typeof payload?.after === 'string' &&
        isValidDate(new Date(payload.after))
      ) {
        const maxDays = +(payload?.maxDays ?? 0);
        const startDate = new Date(payload.after);
        const endDate = addDays(startDate, maxDays > 0 && maxDays <= 3 ? maxDays : 1);

        const { message, details } = await this.getFailedLoginsByDate(transactionId, startDate, endDate);

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (actionType === 'change-user-status' && Array.isArray(payload?.psIds) && typeof payload.status === 'string') {
        const successfulPsIds: string[] = [];
        const unfoundPsIds: string[] = [];

        if (payload.status in ActiveStateEnum) {
          const enrolledUsers = await userService.getObUsersByPsIds(transactionId, payload.psIds as string[]);

          if (payload.psIds.length !== enrolledUsers.length) {
            const existingPsIdSet = new Set<string>();
            enrolledUsers.forEach(({ employeePsId }) => {
              existingPsIdSet.add(employeePsId);
            });

            payload.psIds.forEach((requestedPsId) => {
              if (!existingPsIdSet.has(requestedPsId)) {
                unfoundPsIds.push(requestedPsId);
              }
            });
          }

          for (const enrolledUser of enrolledUsers) {
            await userService.updateUserByPsId(transactionId, {
              psId: enrolledUser.employeePsId,
              activeStatus: payload.status,
            });

            /**
             * @deprecated
             * TODO: Remove after new Chat vendor enablement
             */
            await Promise.allSettled(
              enrolledUser.branchAccess.selectedBranchIds.map((branchId) =>
                chatService.syncChatGroupForBranch(transactionId, branchId),
              ),
            );
            successfulPsIds.push(enrolledUser.employeePsId);
          }
        }

        isActionSuccessful = true;
        actionMessage = `Status changed to ${payload.status}`;
        actionResults = {
          successfulPsIds,
          unfoundPsIds,
        };
      }

      if (actionType === 'notify-user' && Array.isArray(payload?.psIds) && payload?.title && payload?.body) {
        const { psIds, title, body, placements, expiresInDays, isClearable, redirectionParams } = payload as {
          psIds: string[];
          title: string;
          body: string;
          placements?: string[];
          expiresInDays?: number;
          isClearable?: boolean;
          redirectionParams?: {
            resourceUrl?: string;
            mediaType?: string;
            pollId?: string;
            pollType?: string;
          };
        };

        const expiresAt = addDays(new Date(), expiresInDays ?? 1);

        const { message, details } = await this.notifyUserByPsIds(transactionId, psIds, {
          title,
          body,
          placements,
          expiresAt,
          isClearable,
          redirectionParams,
        });

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (actionType === 'chat_v2/sync/branch-users-access' && typeof payload?.branchId === 'string') {
        const { message, details } = await this.syncChatV2GroupsForUsersByBranchId(transactionId, payload.branchId);

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (
        actionType === 'chat_v2/sync/user' &&
        typeof payload?.psId === 'string' &&
        typeof payload?.branchId === 'string'
      ) {
        const { message, details } = await this.syncChatV2User(transactionId, payload.psId, payload.branchId);

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (actionType === 'chat_v2/sync/system-groups' && typeof payload?.branchId === 'string') {
        const { message, details } = await this.syncChatV2SystemGroups(transactionId, payload.branchId);

        isActionSuccessful = true;
        actionMessage = message;
        actionResults = details;
      }

      if (!isActionSuccessful) {
        throw new Error(`${actionType} failed or unknown action type`);
      }

      response.status(HttpStatusCode.OK).send({
        success: isActionSuccessful,
        message: actionMessage,
        results: actionResults,
      });
    } catch (actionErr) {
      logError(`[${transactionId}] [CONTROLLER] [adminAction] FAILED, reason: ${actionErr.message}`);

      next(actionErr);
    }
  };
}
