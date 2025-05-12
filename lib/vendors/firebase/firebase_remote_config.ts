import config from 'config';
import * as admin from 'firebase-admin';
import { RemoteConfigTemplate } from 'firebase-admin/lib/remote-config/remote-config-api';
import { getSecret } from '..';
import { logError, logInfo } from '../../log/util';
import { FirebaseVendorWebConfigType } from '../../types';

const initializeFirebase = async (): Promise<void> => {
  const firebaseServiceConfig: {
    firebaseTemplateSecrets: string;
    endpoint: string;
    projectId: string;
  } = config.get('Services.firebase');

  const FirebaseConfigEncoded = await getSecret(firebaseServiceConfig.firebaseTemplateSecrets);
  const decodedConfig = Buffer.from(FirebaseConfigEncoded, 'base64').toString('utf-8');

  const firebaseConfig = JSON.parse(decodedConfig);

  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
    databaseURL: `https://${firebaseServiceConfig.endpoint}/${firebaseServiceConfig.projectId}.firebaseio.com`,
  });
};
initializeFirebase();

const getValuesFromRemoteConfig = async (txId: string): Promise<RemoteConfigTemplate> => {
  try {
    logInfo(`[${txId}] getValuesFromRemoteConfig => Fetching remote config from firebase`);

    const remoteConfig: RemoteConfigTemplate = await admin.remoteConfig().getTemplate();

    logInfo(`[${txId}] getValuesFromRemoteConfig => Fetching completed from firebase`);

    return remoteConfig;
  } catch (error) {
    logError(`[${txId}] getValuesFromRemoteConfig => Error in fetching remote config ${error.message}`);

    throw error;
  }
};

const getFirebaseWebConfig = async (): Promise<FirebaseVendorWebConfigType> => {
  const firebaseServiceConfig: {
    webConfigsSecretKeyName: string;
  } = config.get('Services.firebase');
  const [fbApiKey, fbAuthDomain, fbProjectId, fbStorageBucket, fbMessagingSenderId, fbAppId, fbMeasurementId] = (
    (await getSecret(firebaseServiceConfig.webConfigsSecretKeyName)) ?? ''
  ).split('|');
  const firebaseConfig: FirebaseVendorWebConfigType = {
    apiKey: fbApiKey,
    authDomain: fbAuthDomain,
    projectId: fbProjectId,
    storageBucket: fbStorageBucket,
    messagingSenderId: fbMessagingSenderId,
    appId: fbAppId,
    measurementId: fbMeasurementId,
  };

  return firebaseConfig;
};

const publishRemoteConfigDefaults = async (
  txId: string,
  template: RemoteConfigTemplate,
): Promise<RemoteConfigTemplate> => {
  try {
    logInfo(`[${txId}] publishRemoteConfigDefaults => Creating remote config in firebase`);

    const remoteConfig = admin.remoteConfig();
    await remoteConfig.validateTemplate(template);

    const publishedTemplate: RemoteConfigTemplate = await remoteConfig.publishTemplate(template);

    logInfo(`[${txId}] publishRemoteConfigDefaults => published remote config in firebase`);

    return publishedTemplate;
  } catch (error) {
    logError(`[${txId}] publishRemoteConfigDefaults => Error in publishing remote config ${error.message}`);
    throw error;
  }
};

const updateRemoteConfigTemplate = async (
  txId: string,
  {
    parameters,
    parameterGroups,
    conditions,
  }: {
    parameters?: RemoteConfigTemplate['parameters'];
    parameterGroups?: RemoteConfigTemplate['parameterGroups'];
    conditions?: RemoteConfigTemplate['conditions'];
  },
): Promise<RemoteConfigTemplate> => {
  try {
    if (!parameters && !parameterGroups && !conditions) {
      throw new Error('Nothing to update!');
    }

    logInfo(
      `[${txId}] updateRemoteConfigTemplate => updating remote config with values ${JSON.stringify({
        parameters,
        parameterGroups,
        conditions,
      })}`,
    );

    const remoteConfig = admin.remoteConfig();

    const template: RemoteConfigTemplate = await remoteConfig.getTemplate();

    if (conditions) {
      template.conditions = conditions;
    }

    if (parameters) {
      template.parameters = parameters;
    }

    if (parameterGroups) {
      template.parameterGroups = parameterGroups;
    }

    await remoteConfig.validateTemplate(template);

    const publishedTemplate: RemoteConfigTemplate = await remoteConfig.publishTemplate(template);

    logInfo(
      `[${txId}] updateRemoteConfigTemplate => published remote config with values ${JSON.stringify({
        publishedTemplate,
      })}`,
    );

    return publishedTemplate;
  } catch (err) {
    logError(`[${txId}] updateRemoteConfigTemplate => Error in publishing remote config ${err.message}`);
    throw err;
  }
};

export {
  getValuesFromRemoteConfig,
  publishRemoteConfigDefaults,
  updateRemoteConfigTemplate,
  initializeFirebase,
  getFirebaseWebConfig,
};
