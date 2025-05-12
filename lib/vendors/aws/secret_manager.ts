import {
  GetSecretValueCommand,
  GetSecretValueCommandInput,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import config from 'config';
import { logError } from '../../log/util';

const secretManagerConfig: any = config.get('Services.secretManager');
const secretManagerClient = new SecretsManagerClient({ region: secretManagerConfig.region });

const cachedSecrets: {
  [key: string]: string;
} = {};

const getSecret = async (key: string): Promise<string> => {
  try {
    if (cachedSecrets[key]) {
      return cachedSecrets[key];
    }

    const input: GetSecretValueCommandInput = { SecretId: secretManagerConfig.secretName };
    const data = await secretManagerClient.send(new GetSecretValueCommand(input));

    if ('SecretString' in data) {
      const secretsMap = JSON.parse(data.SecretString);

      if (!cachedSecrets[key]) {
        cachedSecrets[key] = secretsMap[key];
      }

      return cachedSecrets[key];
    } else {
      const buff = Buffer.from(data.SecretBinary as unknown as string, 'base64');
      const secretsMap = JSON.parse(buff.toString());

      if (!cachedSecrets[key]) {
        cachedSecrets[key] = secretsMap[key];
      }

      return secretsMap[key];
    }
  } catch (err) {
    logError(`[ONEBAYSHORE-SECRET] Error occurred while getting secret: ${key}, error: ${err.message}`);

    throw new Error(err);
  }
};

export { getSecret };
