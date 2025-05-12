import { FilterQuery, QueryOptions } from 'mongoose';
import { userService } from '..';
import { AudienceEnum, InteractionTypeEnum } from '../../enums';
import { logInfo, logError } from '../../log/util';
import { OBAlertInteractionModel, OBAlertsModel, OBUserModel } from '../../models';
import {
  OBAlertInteractionOperationType,
  OBAlertUpsertOperationType,
  OBAlertsSchemaType,
  OBUserAlertsSchemaType,
  OBUserSchemaType,
} from '../../types';
import {
  mapAlertRequestToDBRecord,
  mapAlertInteractionRequestToDBRecord,
  createNanoId,
  prefixAlertId,
} from '../../utils';

const getAlerts = async (
  transactionId: string,
  userDetails: { branchIds: string[]; divisionIds: string[]; provincialCodes: string[] },
  filters: FilterQuery<OBAlertsSchemaType>,
  options?: QueryOptions<OBAlertsSchemaType>,
): Promise<OBAlertsSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getAlerts - find all alerts by filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  try {
    const searchQuery: FilterQuery<OBAlertsSchemaType> = {};
    if (options && options.search) {
      const searchRegex = new RegExp(options.search, 'i');
      searchQuery.$or = [
        { alertId: searchRegex },
        { title: searchRegex },
        { description: searchRegex },
        { 'createdBy.displayName': searchRegex },
      ];
    }

    const sortQuery: QueryOptions<OBAlertsSchemaType> = {};
    if (options && options.sortField) {
      sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
    } else {
      sortQuery.createdAt = -1;
    }

    const alertsQueryCursor = OBAlertsModel.find({ ...filters, ...searchQuery })
      .sort(sortQuery)
      .skip(options.skip)
      .limit(options.limit)
      .cursor();

    const alerts: OBAlertsSchemaType[] = [];

    for await (const alert of alertsQueryCursor) {
      alerts.push(alert.toJSON());
    }

    const filteredAlerts: OBAlertsSchemaType[] = [];

    alerts.forEach((alert) => {
      switch (true) {
        case alert.audienceLevel === AudienceEnum.National:
        case userDetails.branchIds.includes('*') ||
          (alert.audienceLevel === AudienceEnum.Branch &&
            alert.branchIds.some((id) => userDetails.branchIds.includes(id))):
        case userDetails.divisionIds.includes('*') ||
          (alert.audienceLevel === AudienceEnum.Division &&
            alert.divisionIds.some((id) => userDetails.divisionIds.includes(id))):
        case userDetails.provincialCodes.includes('*') ||
          (alert.audienceLevel === AudienceEnum.Province &&
            alert.provincialCodes.some((id) => userDetails.provincialCodes.includes(id))):
          filteredAlerts.push(alert);
          break;
        default:
      }
    });

    logInfo(`[${transactionId}] [SERVICE] getAlerts - total alerts retrieved filters: ${JSON.stringify(filters)}`);

    return filteredAlerts;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getAlerts - FAILED, reason: ${listErr.message}`);
    throw listErr;
  }
};

const createAlert = async (
  transactionId: string,
  alertData: OBAlertUpsertOperationType,
): Promise<OBAlertsSchemaType> => {
  try {
    if (!alertData.title || !alertData.description || !alertData.accessLevelNames || !alertData.audienceLevel) {
      throw new Error(
        'Missing one or more of the mandatory fields for creating alert: title, description, accessLevels, audienceLevel',
      );
    }
    switch (alertData.audienceLevel) {
      case AudienceEnum.Branch:
        if (!Array.isArray(alertData.branchIds) || alertData.branchIds.length === 0) {
          throw new Error('Missing mandatory field branchIds');
        }
        break;
      case AudienceEnum.Division:
        if (!Array.isArray(alertData.divisionIds) || alertData.divisionIds.length === 0) {
          throw new Error('Missing mandatory field divisionIds');
        }
        break;
      case AudienceEnum.Province:
        if (!Array.isArray(alertData.provincialCodes) || alertData.provincialCodes.length === 0) {
          throw new Error('Missing mandatory field provincialCodes');
        }
        break;
      default:
        alertData.audienceLevel = AudienceEnum.National;
        break;
    }

    if (!alertData.alertId) {
      const id = createNanoId(5);
      alertData.alertId = prefixAlertId(id);
    }

    // TODO remove after migration
    const alertPostedByEmployee: OBUserSchemaType = await userService.getObUsersByPsId(
      transactionId,
      alertData.createdBy.employeePsId,
    );

    if (alertPostedByEmployee) {
      alertData.createdBy = {
        employeePsId: alertPostedByEmployee.employeePsId,
        displayName: alertPostedByEmployee.displayName,
        userImageLink: alertPostedByEmployee.tempProfile?.tempProfileImgUrl,
      };
    }

    const translatedAlert = mapAlertRequestToDBRecord(alertData);

    logInfo(
      `[${transactionId}] [SERVICE] createAlert - create record initiated for alertId: ${translatedAlert.alertId}`,
    );

    const newObAlert = new OBAlertsModel(translatedAlert);

    // Storing the record
    const createdAlert = await newObAlert.save();

    const createdData = createdAlert.toJSON();

    logInfo(
      `[${transactionId}] [SERVICE] createAlert - create record SUCCESSFUL for alertId: ${translatedAlert.alertId}`,
    );

    return createdData;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createAlert - ERROR creating alert ${alertData.alertId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const getAlertById = async (transactionId: string, alertId: string): Promise<OBAlertsSchemaType> => {
  logInfo(`[${transactionId}] [SERVICE] getAlertById - find alert by ID, requested: ${alertId}`);

  try {
    return OBAlertsModel.findOne({ alertId });
  } catch (readError) {
    logError(`[${transactionId}] [SERVICE] getAlertById - ERROR reading alert, reason: ${readError.message}`);

    throw new Error('Unable to read alert by ID');
  }
};

const alertInteracted = async (
  transactionId: string,
  alertInteractionData: OBAlertInteractionOperationType,
): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] alertInteracted initiated for ${alertInteractionData.alertId}`);

  try {
    const existingAlert = (await OBAlertsModel.findOne({
      alertId: alertInteractionData.alertId,
    })) as OBAlertsSchemaType;

    if (!existingAlert) {
      throw new Error('Alert Not Found!');
    }

    // TODO remove after migration
    const reactedUser = await userService.getObUsersByPsId(transactionId, alertInteractionData.interactedUserPsId);

    if (!reactedUser) {
      throw new Error('User Not Found!');
    }

    alertInteractionData.interactedUserName = reactedUser.displayName;
    if (reactedUser.tempProfile && reactedUser.tempProfile.tempProfileImgUrl) {
      alertInteractionData.interactedUserImage = reactedUser.tempProfile.tempProfileImgUrl;
    }

    // check if user has already reacted on an alert
    const existingAlertReaction = await OBAlertInteractionModel.findOne({
      alertId: alertInteractionData.alertId,
      reactedUserPsId: alertInteractionData.interactedUserPsId,
    });

    if (existingAlertReaction) {
      if (existingAlertReaction.interactionType === alertInteractionData.interactionType) {
        return alertInteractionData.alertId;
      }
    }

    const translatedAlertInteraction = mapAlertInteractionRequestToDBRecord(alertInteractionData);

    if (translatedAlertInteraction.interactionType === InteractionTypeEnum.Read) {
      const MAX_TOP_ALERTS = 20; // Set the maximum number of top alerts
      const user = await userService.getObUsersByPsId(transactionId, alertInteractionData.interactedUserPsId);
      if (user) {
        // Add the alert to the user's top alerts array
        const newTopAlert: OBUserAlertsSchemaType = {
          alertName: existingAlert.title,
          alertTitle: existingAlert.description,
          alertId: existingAlert.alertId,
          alertAddedAt: new Date(),
        };

        if (user.topAlerts.length >= MAX_TOP_ALERTS) {
          user.topAlerts.shift(); // Remove the oldest alert from the beginning of the array
        }

        user.topAlerts.push(newTopAlert);

        // Update the user object in the database
        await OBUserModel.findOneAndUpdate(
          { psId: alertInteractionData.interactedUserPsId },
          { topAlerts: user.topAlerts },
          { new: true }, // return the updated user document
        );
      }
    } else {
      // Ignore storing alert interactions that are not of type 'Read'
      return alertInteractionData.alertId;
    }

    logInfo(
      `[${transactionId}] [SERVICE] alertInteraction - create record initiated for alert interacted: ${translatedAlertInteraction.alertId}`,
    );

    const newObAlertInteraction = new OBAlertInteractionModel(translatedAlertInteraction);

    // Storing the record
    await newObAlertInteraction.save();

    logInfo(
      `[${transactionId}] [SERVICE] alertInteraction - create record SUCCESSFUL for alertId: ${translatedAlertInteraction.alertId}`,
    );

    return translatedAlertInteraction.alertId;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] alertInteracted failed with error: ${error.message}`);
    throw error;
  }
};

const removeAlertByAlertId = async (transactionId: string, removeAlertId: string, force = false): Promise<string> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] removeAlertByAlertId - Removing alert ${removeAlertId}`);

    if (!removeAlertId) {
      throw new Error('Provide a valid alertId to remove');
    }

    if (force) {
      // Hard Delete
      const { deletedCount } = await OBAlertsModel.deleteOne({ alertId: removeAlertId });
      logInfo(
        `[${transactionId}] [SERVICE] removeAlertByAlertId - Hard Removing news SUCCESSFUL for alertId: ${removeAlertId}, deletedCount: ${deletedCount}`,
      );
    } else {
      // Soft Delete
      await OBAlertsModel.findOneAndUpdate(
        { alertId: removeAlertId },
        { isDeleted: true, updatedAt: new Date() },
        { new: true },
      );

      logInfo(
        `[${transactionId}] [SERVICE] removeAlertByAlertId - Soft Removing news SUCCESSFUL for alertId: ${removeAlertId}`,
      );
    }

    return removeAlertId;
  } catch (removeErr) {
    logError(`[${transactionId}] [SERVICE] removeAlertByAlertId - Removing alert FAILED, reason: ${removeErr.message}`);

    throw removeErr;
  }
};

export { getAlerts, createAlert, getAlertById, alertInteracted, removeAlertByAlertId };
