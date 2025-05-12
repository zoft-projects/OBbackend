import axios from 'axios';
import config from 'config';
import { GoogleAuth } from 'google-auth-library';
import {
  NotificationPlacementEnum,
  NotificationOriginEnum,
  NotificationStatusEnum,
  NotificationTypeEnum,
} from '../../enums';
import { logError, logInfo } from '../../log/util';
import { OBPushNotificationModel } from '../../models';
import { JSONLikeType, OBPushNotificationSchemaType } from '../../types';
import { prefixNotificationId, createNanoId } from '../../utils';
import { getSecret } from '../../vendors';

const notificationsConfig: { backupPushNotificationResults: boolean } = config.get('Features.notifications');
const frontendURL = config.get('Environment.frontendURL') as string;

type PushNotificationSentResponsePayloadType = {
  name: string;
};

type SendNotificationReturnType = {
  failedTokens: string[];
  successTokens: string[];
};

type NotificationApiInputType = {
  message: {
    token: string;
    notification: {
      title: string;
      body: string;
    };
    data?: JSONLikeType;
    webpush?: {
      fcmOptions: {
        link: string;
      };
    };
  };
};

type NotificationTopicType = {
  message: {
    topic: string;
    notification: {
      title: string;
      body: string;
    };
    data?: JSONLikeType;
    webpush?: {
      fcmOptions: {
        link: string;
      };
    };
  };
};

const getAccessToken = async (txId: string): Promise<string> => {
  const firebaseServiceConfig: {
    firebaseTemplateSecrets: string;
  } = config.get('Services.firebase');

  const FirebaseConfigEncoded = await getSecret(firebaseServiceConfig.firebaseTemplateSecrets);
  const decodedConfig = Buffer.from(FirebaseConfigEncoded, 'base64').toString('utf-8');

  const firebaseConfig = JSON.parse(decodedConfig);
  const scopes = ['https://www.googleapis.com/auth/firebase.messaging'];

  try {
    const auth = new GoogleAuth({
      credentials: firebaseConfig,
      scopes,
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();

    const accessToken = tokenResponse.token;

    return accessToken;
  } catch (error) {
    logError(
      `[${txId}] [SERVICE] getAccessToken - ERROR getting access for push notification, reason: ${error.message}`,
    );

    throw error;
  }
};

const sendPushNotification = async (
  txId: string,
  employeePsId: string,
  registrationTokens: string[],
  notification: {
    title: string;
    body: string;
    data?: JSONLikeType;
  },
): Promise<SendNotificationReturnType> => {
  try {
    logInfo(`[${txId}] [SERVICE] sendPushNotification Started for ${employeePsId} sending push notification`);

    if (registrationTokens.length === 0) {
      throw new Error('No user tokens available to send push notifications');
    }

    // Take max of 3 device tokens to send push notifications per users
    const tokens = registrationTokens.slice(0, 3);

    const pushMessages: NotificationApiInputType[] = [];

    tokens.forEach((token) => {
      const { redirectionScreen, redirectionScreenProps } = notification.data ?? {};

      pushMessages.push({
        message: {
          token,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: notification.data
            ? {
                deeplinkTo: redirectionScreen,
                deeplinkParams: undefined,
                deepLinkParamsStringified: redirectionScreenProps ? JSON.stringify(redirectionScreenProps) : undefined,
              }
            : undefined,
        },
      });
    });

    const firebaseServiceConfig: {
      endpoint: string;
      projectId: string;
    } = config.get('Services.firebase');

    const endpoint = `${firebaseServiceConfig.endpoint}/${firebaseServiceConfig.projectId}/messages:send`;

    const accessToken = await getAccessToken(txId);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };

    const sendingResults = await Promise.allSettled(
      pushMessages.map(async (eachMessage: NotificationApiInputType) => {
        const pushResponse = await axios.post<PushNotificationSentResponsePayloadType>(endpoint, eachMessage, {
          headers,
        });
        logInfo(`[${txId}] [SERVICE] sendPushNotification Push message response ${JSON.stringify(pushResponse.data)}`);

        return {
          name: pushResponse.data.name,
          token: eachMessage.message.token,
        };
      }),
    );

    const data: SendNotificationReturnType = {
      failedTokens: [],
      successTokens: [],
    };

    const errorReasons: string[] = [];

    sendingResults.forEach((result) => {
      if (result.status === 'rejected') {
        errorReasons.push(result.reason);

        return;
      }

      data.successTokens.push(result.value.token);
    });

    data.failedTokens = tokens.filter((token) => !data.successTokens.includes(token));

    if (data.failedTokens.length > 0) {
      logInfo(`[${txId}] [SERVICE] sendPushNotification failed for ${employeePsId} => ${JSON.stringify(errorReasons)}`);
    }

    return data;
  } catch (err) {
    logError(
      `[${txId}] [SERVICE] sendPushNotification - ERROR sending push notification for ${employeePsId}, reason: ${err.message}`,
    );

    throw err;
  }
};

const isNotificationDataValid = (notificationData: OBPushNotificationSchemaType) => {
  if (
    !notificationData.notificationId ||
    !notificationData.notificationMode ||
    !notificationData.notificationType ||
    !notificationData.notificationOrigin ||
    !notificationData.userPsId ||
    !notificationData.notificationTitle ||
    !notificationData.notificationBody ||
    !notificationData.notificationStatus
  ) {
    return false;
  }

  return true;
};

const storeNotificationLog = async (txId: string, notifications: OBPushNotificationSchemaType[]): Promise<void> => {
  try {
    const hasInvalidData: boolean[] = notifications
      .map((notificationData) => isNotificationDataValid(notificationData))
      .filter((ite) => !ite);

    if (hasInvalidData?.length > 0) {
      throw new Error('Missing required parameters');
    }

    logInfo(`[${txId}] [SERVICE] storeNotificationLog - Started saving notification data`);

    await OBPushNotificationModel.insertMany(notifications);

    logInfo(`[${txId}] [SERVICE] storeNotificationLog - notification data stored successfully`);
  } catch (err) {
    logError(`[${txId}] [SERVICE] storeNotificationLog - ERROR storing push notification, reason: ${err.message}`);
    throw err;
  }
};

// TODO: should deviceTokens be renamed to deviceIds as that is what it seems to be. deviceTokens are of a different type altogether in codebase ie OBDeviceTokenType
type PushNotificationInputType = {
  userPsId: string;
  deviceTokens: string[];
  notificationId?: string;
  notificationMode: NotificationPlacementEnum;
  notificationType: NotificationTypeEnum;
  notificationOrigin: NotificationOriginEnum;
  notificationTitle: string;
  notificationBody: string;
  optionalData?: JSONLikeType;
  description?: string;
};

const isValidSendPushNotificationInput = (notificationData: PushNotificationInputType) => {
  if (
    !notificationData.userPsId ||
    !notificationData.notificationTitle ||
    !notificationData.notificationBody ||
    notificationData.deviceTokens.length === 0 ||
    !notificationData.notificationMode ||
    !notificationData.notificationType ||
    !notificationData.notificationOrigin
  ) {
    return false;
  }

  return true;
};

/**
 * @deprecated use notificationService.sendNotification to send notifications
 */
const sendPushNotificationToUser = async (
  txId: string,
  notificationData: PushNotificationInputType,
): Promise<string> => {
  try {
    const isPayloadValid = isValidSendPushNotificationInput(notificationData);

    if (!isPayloadValid) {
      throw new Error('Missing required params');
    }

    const { userPsId, deviceTokens } = notificationData;

    logInfo(`[${txId}] [SERVICE] sendPushNotificationToUser - Push notification triggered for psId ${userPsId}`);

    const notificationResult: SendNotificationReturnType = await sendPushNotification(
      txId,
      notificationData.userPsId,
      deviceTokens,
      {
        title: notificationData.notificationTitle,
        body: notificationData.notificationBody,
        data: notificationData.optionalData,
      },
    );

    if (!notificationsConfig.backupPushNotificationResults) {
      logInfo(
        `[${txId}] [SERVICE] sendPushNotificationToUser - Push completed for psId ${userPsId}, results: ${JSON.stringify(
          notificationResult,
        )}`,
      );

      return notificationData.userPsId;
    }

    const insertNotificationLogs: OBPushNotificationSchemaType[] = [];

    notificationResult.failedTokens?.map(() => {
      const id = createNanoId(5);

      insertNotificationLogs.push({
        notificationBody: notificationData.notificationBody,
        notificationTitle: notificationData.notificationTitle,
        notificationMode: notificationData.notificationMode,
        notificationId: notificationData.notificationId ?? prefixNotificationId(id),
        notificationOrigin: notificationData.notificationOrigin,
        notificationStatus: NotificationStatusEnum.Failed,
        notificationType: notificationData.notificationType,
        userPsId,
        description: notificationData.description,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    notificationResult.successTokens?.map(() => {
      const id = createNanoId(5);

      insertNotificationLogs.push({
        notificationBody: notificationData.notificationBody,
        notificationTitle: notificationData.notificationTitle,
        notificationMode: notificationData.notificationMode,
        notificationId: notificationData.notificationId ?? prefixNotificationId(id),
        notificationOrigin: notificationData.notificationOrigin,
        notificationStatus: NotificationStatusEnum.Sent,
        notificationType: notificationData.notificationType,
        userPsId,
        description: notificationData.description,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    await storeNotificationLog(txId, insertNotificationLogs);

    return notificationData.userPsId;
  } catch (err) {
    logError(
      `[${txId}] [SERVICE] sendPushNotificationToUser - ERROR storing push notification, reason: ${err.message}`,
    );

    throw err;
  }
};

const sendPushNotificationByTopic = async (
  transactionId: string,
  topicName: string,
  notification: {
    title: string;
    body: string;
    optionalData?: JSONLikeType;
  },
): Promise<string> => {
  const firebaseServiceConfig: {
    endpoint: string;
    projectId: string;
  } = config.get('Services.firebase');

  logInfo(`[${transactionId}] [SERVICE] sendPushNotificationByTopic Initiated for topic: ${topicName}`);

  const endpoint = `${firebaseServiceConfig.endpoint}/${firebaseServiceConfig.projectId}/messages:send`;

  const accessToken = await getAccessToken(transactionId);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const notificationPayload: NotificationTopicType = {
    message: {
      topic: topicName,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.optionalData,
      webpush: {
        fcmOptions: {
          link: `${frontendURL}/chat`,
        },
      },
    },
  };

  try {
    const pushResponse = await axios.post<PushNotificationSentResponsePayloadType>(endpoint, notificationPayload, {
      headers,
    });

    logInfo(
      `[${transactionId}] [SERVICE] sendPushNotification Push message response ${JSON.stringify(pushResponse.data)}`,
    );

    return topicName;
  } catch (notificationErr) {
    logError(
      `[${transactionId}] [SERVICE] sendPushNotificationByTopic FAILED for topic: ${topicName}, payload: ${JSON.stringify(
        notification,
      )}, reason: ${notificationErr.message}`,
    );
  }
};

export { sendPushNotificationToUser, sendPushNotificationByTopic };
