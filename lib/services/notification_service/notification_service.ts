import { messaging } from 'firebase-admin';
import { FilterQuery, QueryOptions } from 'mongoose';
import {
  ActiveStateEnum,
  AudienceEnum,
  InteractionTypeEnum,
  JobCategoryEnum,
  NotificationOriginEnum,
  NotificationPlacementEnum,
  NotificationStatusEnum,
  NotificationTypeEnum,
  PriorityEnum,
  ScreenEnum,
  UserLevelEnum,
} from '../../enums';
import { logInfo, logError, logDebug, logWarn } from '../../log/util';
import { OBNotificationModel, OBNotificationInteractionModel } from '../../models';
import { locationService, onboardUserService, userService } from '../../services';
import {
  JSONLikeType,
  NotificationUpsertOperationType,
  NotificationInteractionUpsertOperationType,
  OBNotificationSchemaType,
  OBNotificationInteractionSchemaType,
  OBPrerequisiteUpsertOperationType,
  BasicNotificationType,
} from '../../types';
import {
  createNanoId,
  isValidDate,
  prefixTopicNameForBranch,
  mapNotificationInteractionRequestToDBRecord,
  prefixNotificationId,
  resolveByBatch,
  prefixTopicNameForUser,
  mapAccessNameToBaseLevel,
} from '../../utils';
import * as pushNotificationService from '../push_notification_service/push_notification_service';

type PushNotificationType = {
  userPsIds: string[];
  notificationId: string;
  notificationType: NotificationTypeEnum;
  notificationOrigin: NotificationOriginEnum;
  notificationTitle: string;
  notificationBody: string;
  redirectionScreen?: ScreenEnum;
  redirectionScreenProps?: JSONLikeType;
  description?: string;
};

type UserNotificationType = {
  notificationId?: string;
  notificationTitle: string;
  notificationBody: string;
  description?: string;
  placements?: NotificationPlacementEnum[];
};

const createPushNotification = async (
  transactionId: string,
  pushNotification: PushNotificationType,
): Promise<string | undefined> => {
  try {
    const {
      userPsIds,
      notificationId,
      notificationType,
      notificationOrigin,
      notificationTitle,
      notificationBody,
      redirectionScreen,
      redirectionScreenProps,
      description,
    }: PushNotificationType = pushNotification;

    logInfo(
      `[${transactionId}] [SERVICE] createPushNotification - notification data received, createPushNotification initiated for notificationId ${notificationId}`,
    );

    const userDeviceTokenMap = new Map<string, string[]>();
    const usersWithoutDeviceToken: string[] = [];

    const getDeviceIdsByBatch = async (potentialNotifiedUserIds: string[]) => {
      const batchOfObUsers = await userService.getObUsersByPsIds(transactionId, potentialNotifiedUserIds);

      batchOfObUsers.forEach((obUser) => {
        if (obUser.deviceTokens.length === 0) {
          usersWithoutDeviceToken.push(obUser.employeePsId);
        } else {
          userDeviceTokenMap.set(
            obUser.employeePsId,
            obUser.deviceTokens.map((deviceToken) => deviceToken.deviceId),
          );
        }
      });
    };

    await resolveByBatch(userPsIds, 150, getDeviceIdsByBatch);

    if (userDeviceTokenMap.size === 0) {
      throw new Error('No device tokens available to push notifications');
    }

    if (usersWithoutDeviceToken.length > 0) {
      logWarn(
        `[${transactionId}] [SERVICE] createPushNotification - The following userPsIds had no associated device tokens: ${JSON.stringify(
          usersWithoutDeviceToken,
        )}`,
      );
    }

    const sendPushNotificationsByBatch = async (notifyToUserPsIds: string[]) => {
      const userNotifiedResults = await Promise.allSettled(
        notifyToUserPsIds.map((userPsId) =>
          pushNotificationService.sendPushNotificationToUser(transactionId, {
            userPsId,
            deviceTokens: userDeviceTokenMap.get(userPsId),
            notificationId,
            notificationMode: NotificationPlacementEnum.Push,
            notificationType,
            notificationOrigin,
            notificationTitle,
            notificationBody,
            optionalData: redirectionScreen
              ? {
                  redirectionScreen,
                  redirectionScreenProps,
                }
              : undefined,
            description,
          }),
        ),
      );

      userNotifiedResults.forEach((userResult, index) => {
        if (userResult.status === 'rejected') {
          logWarn(
            `[${transactionId}] [SERVICE] createPushNotification - The following userPsId was NOT notified: ${notifyToUserPsIds[index]}`,
          );
        }
      });
    };

    await resolveByBatch(Array.from(userDeviceTokenMap.keys()), 150, sendPushNotificationsByBatch);

    logInfo(`[${transactionId}] [SERVICE] createPushNotification - SUCCESSFUL for notificationId: ${notificationId}`);

    return notificationId;
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] createPushNotification - FAILED, reason: ${createErr.message}`);
    logDebug(
      `[${transactionId}] [SERVICE] createPushNotification - FAILED details, provided: ${JSON.stringify(
        pushNotification,
      )}`,
    );

    throw createErr;
  }
};

const createUserNotification = async (
  transactionId: string,
  psId: string,
  userNotification: UserNotificationType,
): Promise<string> => {
  try {
    const { notificationId, notificationTitle, notificationBody, description } = userNotification;

    logInfo(
      `[${transactionId}] [SERVICE] createUserNotification - create user queue notification initiated for notificationId ${notificationId}`,
    );

    const userAlertAdditionResults = await userService.addUserAlert(transactionId, psId, {
      alertId: notificationId,
      alertName: notificationTitle,
      alertTitle: notificationBody,
      alertDesc: description,
      alertAddedAt: new Date(),
    });

    logInfo(
      `[${transactionId}] [SERVICE] createUserNotification - COMPLETED, results: ${JSON.stringify(
        userAlertAdditionResults,
      )}`,
    );

    return notificationId;
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] createUserNotification - FAILED, reason: ${createErr.message}`);
    logDebug(
      `[${transactionId}] [SERVICE] createUserNotification - FAILED details, provided: ${JSON.stringify(
        userNotification,
      )}`,
    );

    throw createErr;
  }
};

// This method would assess the input values and call any/all of the above methods when required
const sendNotification = async (
  transactionId: string,
  notification: NotificationUpsertOperationType,
): Promise<string> => {
  try {
    const {
      notificationId: overrideNotificationId,
      priority,
      expiresAt,
      notificationPlacements,
      redirectionScreen,
      redirectionScreenProps,
      notificationVisibility,
      notificationType,
      notificationOrigin,
      notificationTitle,
      notificationBody,
      userPsIds,
      branchIds,
      divisionIds,
      provincialCodes,
      audienceLevel,
      description,
      createdBy,
      isClearable,
    }: NotificationUpsertOperationType = notification;

    logInfo(
      `[${transactionId}] [SERVICE] sendNotification initiated for title: ${notificationTitle}, placements: ${JSON.stringify(
        notificationPlacements,
      )}`,
    );

    const isTypePush = notificationPlacements.includes(NotificationPlacementEnum.Push);
    const isTypeDashboard = notificationPlacements.includes(NotificationPlacementEnum.Dashboard);
    const isTypeUserQueue = notificationPlacements.includes(NotificationPlacementEnum.UserQueue);
    const isTypePrerequisite = notificationPlacements.includes(NotificationPlacementEnum.Prerequisite);

    logInfo(
      `[${transactionId}] [SERVICE] sendNotification isTypePush: ${isTypePush}, isTypeDashboard: ${isTypeDashboard}, isTypeUserQueue: $${isTypeUserQueue}`,
    );

    if (
      ((isTypeDashboard || isTypeUserQueue) && (!priority || !notificationVisibility)) ||
      !notificationType ||
      !notificationOrigin ||
      !notificationTitle ||
      !notificationBody
    ) {
      throw new Error('Required fields are missing.');
    }

    if (expiresAt && !isValidDate(expiresAt)) {
      throw new Error('Invalid expiry date.');
    }

    if (branchIds) {
      const existentBranches = await locationService.getAllBranchesByIds(transactionId, branchIds);
      if (Array.isArray(existentBranches) && existentBranches.length < branchIds.length) {
        throw new Error("Some or all inputted branchIds don't exist in the system.");
      }
    }

    const notificationId = overrideNotificationId ?? prefixNotificationId(createNanoId(5));

    logInfo(
      `[${transactionId}] [SERVICE] sendNotification notification assigned notificationId: ${notificationId}, saving to database initiated.`,
    );
    const dbSuitableNotification: OBNotificationSchemaType = {
      notificationId,
      priority,
      expiresAt,
      notificationPlacements,
      redirectionScreen: redirectionScreen
        ? {
            screenName: redirectionScreen,
            data: redirectionScreenProps,
          }
        : undefined,
      notificationVisibility,
      notificationType,
      notificationStatus: NotificationStatusEnum.Sent,
      notificationOrigin,
      notificationTitle,
      notificationBody,
      audienceLevel,
      userPsIds,
      provincialCodes,
      divisionIds,
      branchIds,
      description,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy,
      isClearable,
    };

    const newNotification = new OBNotificationModel(dbSuitableNotification);

    const createdNotification = await newNotification.save();

    logInfo(
      `[${transactionId}] [SERVICE] sendNotification - notification SUCCESSFULLY added to database with notificationId: ${createdNotification.notificationId}`,
    );

    if (isTypePush && userPsIds?.length > 0) {
      logInfo(
        `[${transactionId}] [SERVICE] sendNotification - PUSH notification sending INITIALIZED for notificationId: ${notificationId}`,
      );

      const sentPushNotificationId = await createPushNotification(transactionId, {
        userPsIds,
        notificationId,
        notificationType,
        notificationOrigin,
        notificationTitle,
        notificationBody,
        redirectionScreen,
        redirectionScreenProps,
        description,
      } as PushNotificationType);

      logInfo(`[${transactionId}] [SERVICE] sendNotification - PUSH notification completed: ${sentPushNotificationId}`);
    } else if (isTypePush && branchIds?.length > 0) {
      // If notify to branch, currently target only the Field Staffs
      await Promise.allSettled(
        branchIds.map((branchId) =>
          notifyBranchAndJobLevelByTopicName(
            transactionId,
            branchId,
            {
              jobLevel: mapAccessNameToBaseLevel(UserLevelEnum.FIELD_STAFF),
            },
            {
              title: notificationTitle,
              body: notificationBody,
              redirectionScreen,
              redirectionScreenProps,
            },
          ),
        ),
      );
    }

    // For now, we only consider checking userPsIds and branchIds
    if (isTypePrerequisite && (userPsIds?.length > 0 || branchIds?.length > 0)) {
      logInfo(
        `[${transactionId}] [SERVICE] sendNotification - Prerequisites notification sending INITIALIZED for notificationId: ${notificationId}`,
      );

      const prerequisites = {
        title: notificationTitle,
        description: notificationBody,
        audienceLevel,
        userPsIds,
        branchIds,
        provincialCodes,
        divisionIds,
        accessLevelNames: [UserLevelEnum.FIELD_STAFF], // TODO: missing accessLevelNames in milestone.
        expiresAt,
        status: ActiveStateEnum.Active,
        skippable: true, // TODO: Set Default Values for skippable
        declinable: true, // TODO: Set Default Values for declinable
        requiresAssertion: false, // TODO: Set Default Values for requiresAssertion
      } as OBPrerequisiteUpsertOperationType;

      await onboardUserService.createPrerequisite(transactionId, prerequisites);

      logInfo(`[${transactionId}] [SERVICE] sendNotification - Prerequisites notification completed: ${prerequisites}`);
    }

    // Personal notifications can be placed on either/both Dashboard and notification panel
    if ((isTypeUserQueue || isTypeDashboard) && userPsIds?.length > 0) {
      logInfo(
        `[${transactionId}] [SERVICE] sendNotification - saving user notifications INITIATED for notificationId: ${notificationId}`,
      );

      await Promise.allSettled(
        userPsIds.map((userPsId) =>
          createUserNotification(transactionId, userPsId, {
            notificationId,
            notificationTitle,
            notificationBody,
            description,
          }),
        ),
      );

      logInfo(
        `[${transactionId}] [SERVICE] sendNotification - Dashboard or UserQueue notification completed: ${notificationId}`,
      );
    }

    logInfo(`[${transactionId}] [SERVICE] sendNotification - SUCCESSFUL for notificationId: ${notificationId}`);

    return notificationId;
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] sendNotification - FAILED, reason: ${createErr.message}`);
    logDebug(
      `[${transactionId}] [SERVICE] sendNotification - FAILED details, provided: ${JSON.stringify(notification)}`,
    );

    throw createErr;
  }
};

const getNotifications = async (
  transactionId: string,
  filters: FilterQuery<OBNotificationSchemaType>,
  options?: QueryOptions<OBNotificationSchemaType>,
): Promise<OBNotificationSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getNotifications - find all notification by filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  try {
    const { branchIds, divisionIds, provincialCodes } = filters;
    if (!branchIds || !divisionIds || !provincialCodes) {
      throw new Error('Invalid branch | division | provincialCodes!');
    }
    const filterQuery: FilterQuery<OBNotificationSchemaType> = {
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $eq: null } }, { expiresAt: { $gte: new Date() } }],
    };
    if (options && options.search) {
      const searchRegex = new RegExp(options.search, 'i');
      filterQuery.$or = [
        ...filterQuery.$or,
        { notificationId: searchRegex },
        { notificationTitle: searchRegex },
        { notificationBody: searchRegex },
        { 'createdBy.displayName': searchRegex },
      ];
    }

    const sortQuery: QueryOptions<OBNotificationSchemaType> = {};
    if (options && options.sortField) {
      sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
    } else {
      sortQuery.createdAt = -1;
    }
    const notificationQueryCursor = OBNotificationModel.find({
      ...filterQuery,
      notificationType: filters.notificationType,
      isDeleted: filters.isDeleted,
    })
      .sort(sortQuery)
      .skip(options?.skip ?? 0)
      .limit(options?.limit ?? 100)
      .cursor();

    const notifications: OBNotificationSchemaType[] = [];

    for await (const notification of notificationQueryCursor) {
      notifications.push(notification.toJSON());
    }

    const filteredNotifications: OBNotificationSchemaType[] = [];

    notifications.forEach((notification) => {
      switch (true) {
        case notification.notificationVisibility === AudienceEnum.National:
        case branchIds.includes('*') ||
          (notification.notificationVisibility === AudienceEnum.Branch &&
            notification.branchIds.some((id) => branchIds.includes(id))):
        case divisionIds.includes('*') ||
          (notification.notificationVisibility === AudienceEnum.Division &&
            notification.divisionIds.some((id) => divisionIds.includes(id))):
        case provincialCodes.includes('*') ||
          (notification.notificationVisibility === AudienceEnum.Province &&
            notification.provincialCodes.some((id) => provincialCodes.includes(id))):
          filteredNotifications.push(notification);
          break;
      }
    });

    logInfo(
      `[${transactionId}] [SERVICE] getNotifications - total notifications retrieved filters: ${JSON.stringify(
        filters,
      )}, total: ${filteredNotifications.length}`,
    );

    return filteredNotifications;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getNotifications - FAILED, reason: ${listErr.message}`);
    throw listErr;
  }
};

const getUserNotificationsByFilter = async (
  transactionId: string,
  filters: FilterQuery<OBNotificationSchemaType>,
  options?: {
    limit: number;
    skip: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  },
): Promise<OBNotificationSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getUserNotificationsByFilter - find all notifications by filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  try {
    const sortQuery: QueryOptions<OBNotificationSchemaType> = {
      priorityOrder: 1,
    };
    if (options && options.sortField) {
      sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
    } else {
      sortQuery.createdAt = -1;
    }

    // TODO: Add a query builder helper method
    const notificationsQueryCursor = OBNotificationModel.aggregate<OBNotificationSchemaType>([
      {
        $match: {
          ...filters,
        },
      },
      {
        $addFields: {
          priorityOrder: {
            $indexOfArray: [
              [PriorityEnum.Highest, PriorityEnum.High, PriorityEnum.Medium, PriorityEnum.Low],
              '$priority',
            ],
          },
        },
      },
      {
        $sort: sortQuery,
      },
    ])
      .skip(options.skip)
      .limit(options.limit);

    const notifications: OBNotificationSchemaType[] = [];

    for await (const notification of notificationsQueryCursor) {
      notifications.push(notification);
    }

    logInfo(`[${transactionId}] [SERVICE] getUserNotificationsByFilter - notifications retrieval SUCCESSFUL`);

    return notifications;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getUserNotificationsByFilter - FAILED,  reason: ${listErr.message}`);
    // throw listErr;

    // Silent fail until complete testing is done
    return [];
  }
};

const notificationInteraction = async (
  transactionId: string,
  notificationInteractionData: NotificationInteractionUpsertOperationType,
): Promise<string> => {
  logInfo(
    `[${transactionId}] [SERVICE] notificationInteraction initiated for ${notificationInteractionData.notificationId}`,
  );

  try {
    if (!(notificationInteractionData.interactionType in InteractionTypeEnum)) {
      throw new Error('Invalid Interaction Type!');
    }

    const existingNotification = await OBNotificationModel.findOne({
      notificationId: notificationInteractionData.notificationId,
    });

    if (!existingNotification) {
      throw new Error('Notification Not Found!');
    }

    const translatedNotificationInteraction = mapNotificationInteractionRequestToDBRecord(notificationInteractionData);

    // check if user has already interacted with notification
    const existingNotificationInteraction = await OBNotificationInteractionModel.findOne({
      notificationId: notificationInteractionData.notificationId,
      interactedUserPsId: notificationInteractionData.interactedUserPsId,
    });

    if (existingNotificationInteraction) {
      if (existingNotificationInteraction.interactionType === translatedNotificationInteraction.interactionType) {
        return translatedNotificationInteraction.notificationId;
      } else {
        await existingNotificationInteraction.deleteOne();

        logInfo(
          `[${transactionId}] [SERVICE] notificationInteraction - delete record SUCCESSFUL for notificationId: ${translatedNotificationInteraction.notificationId}`,
        );
      }
    }

    logInfo(
      `[${transactionId}] [SERVICE] notificationInteraction - create record initiated for notification interacted: ${translatedNotificationInteraction.notificationId}`,
    );

    const newObNotificationInteraction = new OBNotificationInteractionModel(translatedNotificationInteraction);

    // Storing the record
    await newObNotificationInteraction.save();

    logInfo(
      `[${transactionId}] [SERVICE] notificationInteraction - create record SUCCESSFUL for notificationId: ${translatedNotificationInteraction.notificationId}`,
    );

    if (translatedNotificationInteraction.interactionType === InteractionTypeEnum.Read) {
      const { interactedUserPsId } = translatedNotificationInteraction;

      const interactedUser = await userService.getObUsersByPsId(transactionId, interactedUserPsId);

      const updatedAlerts = interactedUser.topAlerts.filter(
        (alert) => alert.alertId !== translatedNotificationInteraction.notificationId,
      );

      logInfo(
        `[${transactionId}] [SERVICE] notificationInteraction - update record initiated for user, psId: ${interactedUserPsId}`,
      );

      await userService.updateUserByPsId(transactionId, { psId: interactedUserPsId, topAlerts: updatedAlerts });

      logInfo(
        `[${transactionId}] [SERVICE] notificationInteraction - update record successful for user, psId: ${interactedUserPsId}`,
      );
    }

    return translatedNotificationInteraction.notificationId;
  } catch (err) {
    logError(
      `[${transactionId}] [SERVICE] notificationInteraction - ERROR while adding interaction for ${notificationInteractionData.notificationId}, reason: ${err.message}`,
    );

    throw err;
  }
};
const removeNotificationById = async (
  transactionId: string,
  notificationId: string,
  force = false,
): Promise<string> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] removeNotificationById - Removing Notification ${notificationId}`);

    if (!notificationId) {
      throw new Error('Provide a valid notificationId to remove');
    }

    if (force) {
      // Hard Delete
      const { deletedCount } = await OBNotificationModel.deleteOne({ notificationId });
      logInfo(
        `[${transactionId}] [SERVICE] removeNotificationById - Hard Removing Notification SUCCESSFUL for notificationId: ${notificationId}, deletedCount: ${deletedCount}`,
      );
    } else {
      // Soft Delete
      await OBNotificationModel.findOneAndUpdate({ notificationId }, { isDeleted: true, updatedAt: new Date() });

      logInfo(
        `[${transactionId}] [SERVICE] removeNotificationById - Soft Removing Notification SUCCESSFUL for notificationId: ${notificationId}`,
      );
    }

    return notificationId;
  } catch (removeErr) {
    logError(
      `[${transactionId}] [SERVICE] removeNotificationById - Removing Notification FAILED, reason: ${removeErr.message}`,
    );

    throw removeErr;
  }
};

const getNotificationById = async (
  transactionId: string,
  notificationId: string,
): Promise<OBNotificationSchemaType> => {
  logInfo(`[${transactionId}] [SERVICE] getNotificationById - find notification by ID, requested: ${notificationId}`);

  try {
    return OBNotificationModel.findOne({ notificationId });
  } catch (readError) {
    logError(
      `[${transactionId}] [SERVICE] getNotificationById - ERROR reading notification, reason: ${readError.message}`,
    );

    throw new Error('Unable to read notification by ID');
  }
};

const getInteractedNotificationsByIds = async (
  transactionId: string,
  notificationIds: string[],
  userPsId: string,
): Promise<OBNotificationInteractionSchemaType[]> => {
  logInfo(`[${transactionId}] [SERVICE] getInteractedNotificationsByIds get interacted notifications for: ${userPsId}`);

  try {
    const notificationInteractionsCursor = OBNotificationInteractionModel.find({
      notificationId: {
        $in: notificationIds,
      },
      interactedUserPsId: userPsId,
    });

    const notificationInteractions: OBNotificationInteractionSchemaType[] = [];

    for await (const notificationInteraction of notificationInteractionsCursor) {
      notificationInteractions.push(notificationInteraction.toJSON());
    }

    return notificationInteractions;
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] getInteractedNotificationsByIds error, reason: ${fetchErr.message}`);

    return [];
  }
};

/**
 * TODO: Revisit and enhance this method with more flexibility
 * @description Notify the users by branch id and job level
 */
const notifyBranchAndJobLevelByTopicName = async (
  transactionId: string,
  branchId: string,
  jobInfo: {
    jobLevel: number;
    jobCategory?: JobCategoryEnum;
  },
  notification: BasicNotificationType,
): Promise<boolean> => {
  logInfo(
    `[${transactionId}] [SERVICE] notifyBranchAndJobLevelByTopicName initiated for branchId: ${branchId} and job: ${JSON.stringify(
      jobInfo,
    )}`,
  );

  try {
    let topicName: string;

    if (jobInfo.jobCategory === JobCategoryEnum.Clinical) {
      topicName = prefixTopicNameForBranch(branchId, `u_clinical_${jobInfo.jobLevel}`);
    } else if (jobInfo.jobCategory === JobCategoryEnum.NonClinical) {
      topicName = prefixTopicNameForBranch(branchId, `u_non_clinical_${jobInfo.jobLevel}`);
    } else {
      topicName = prefixTopicNameForBranch(branchId, `u${jobInfo.jobLevel}`);
    }

    await pushNotificationService.sendPushNotificationByTopic(transactionId, topicName, {
      title: notification.title,
      body: notification.body,
      optionalData: notification.redirectionScreen
        ? {
            deeplinkTo: notification.redirectionScreen,
            deeplinkParams: undefined,
            deepLinkParamsStringified: notification.redirectionScreenProps
              ? JSON.stringify(notification.redirectionScreenProps)
              : undefined,
          }
        : undefined,
    });

    logInfo(
      `[${transactionId}] [SERVICE] notifyBranchAndJobLevelByTopicName SUCCESSFUL for branchId: ${branchId} and job: ${JSON.stringify(
        jobInfo,
      )}`,
    );

    return true;
  } catch (notifyErr) {
    logError(
      `[${transactionId}] [SERVICE] notifyBranchAndJobLevelByTopicName FAILED for branchId: ${branchId} and job: ${JSON.stringify(
        jobInfo,
      )}, notification: ${JSON.stringify(notification)}`,
    );

    return false;
  }
};

/**
 * @description Notify the user by employee PS ID
 */
const notifyEmployeeByTopicName = async (
  transactionId: string,
  employeePsId: string,
  notification: BasicNotificationType,
): Promise<boolean> => {
  logInfo(`[${transactionId}] [SERVICE] notifyEmployeeByTopicName initiated for employeePsId: ${employeePsId}`);

  try {
    const topicName = prefixTopicNameForUser(employeePsId);

    await pushNotificationService.sendPushNotificationByTopic(transactionId, topicName, {
      title: notification.title,
      body: notification.body,
      optionalData: notification.redirectionScreen
        ? {
            deeplinkTo: notification.redirectionScreen,
            deeplinkParams: undefined,
            deepLinkParamsStringified: notification.redirectionScreenProps
              ? JSON.stringify(notification.redirectionScreenProps)
              : undefined,
          }
        : undefined,
    });

    logInfo(`[${transactionId}] [SERVICE] notifyEmployeeByTopicName SUCCESSFUL for employeePsId: ${employeePsId}`);

    return true;
  } catch (notifyErr) {
    logError(
      `[${transactionId}] [SERVICE] notifyEmployeeByTopicName FAILED for employeePsId: ${employeePsId}, notification: ${JSON.stringify(
        notification,
      )}`,
    );

    return false;
  }
};

const subscribeToTopic = async (transactionId: string, token: string, topic: string): Promise<void> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] subscribeToTopic - INITIATED for topic: ${topic}`);

    await messaging().subscribeToTopic(token, topic);

    logInfo(`[${transactionId}] [SERVICE] subscribeToTopic - SUCCESSFUL for topic: ${topic}`);
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] subscribeToTopic - FAILED, reason: ${error.message}`);
    throw error;
  }
};

const unsubscribeFromTopic = async (transactionId: string, token: string, topic: string): Promise<void> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] unsubscribeFromTopic - INITIATED for topic: ${topic}`);

    await messaging().unsubscribeFromTopic(token, topic);

    logInfo(`[${transactionId}] [SERVICE] unsubscribeFromTopic - SUCCESSFUL for topic: ${topic}`);
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] unsubscribeFromTopic - FAILED, reason: ${error.message}`);
    throw error;
  }
};

export {
  sendNotification,
  getUserNotificationsByFilter,
  notificationInteraction,
  getInteractedNotificationsByIds,
  getNotifications,
  removeNotificationById,
  getNotificationById,
  notifyBranchAndJobLevelByTopicName,
  notifyEmployeeByTopicName,
  subscribeToTopic,
  unsubscribeFromTopic,
};
