import config from 'config';
import express from 'express';
import createError from 'http-errors';

import { logWarn, logInfo } from '../../log/util';
import { getSecret } from '../../vendors';

const { legacyApiKeyHeader, legacyApiSecretKeyName }: { legacyApiKeyHeader: string; legacyApiSecretKeyName: string } =
  config.get('Services.onebayshore');

const getInternalApiKey = (() => {
  let apiKey: string = null;

  return async (): Promise<string> => {
    if (apiKey) {
      return apiKey;
    }
    apiKey = await getSecret(legacyApiSecretKeyName);

    return apiKey;
  };
})();

const getIncomingApiKey = (req: express.Request) => req.get(legacyApiKeyHeader.toLowerCase());

const onebayshoreInternalApiMiddleware = async (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
): Promise<void> => {
  const transactionId = req.txId;
  const incomingApiKey = getIncomingApiKey(req);
  const expectedApiKey = await getInternalApiKey();

  if (incomingApiKey === expectedApiKey) {
    logInfo(`[${transactionId}] Validated onebayshore internal authentication using API Key successfully`);
    next();
  } else {
    logWarn(`[${transactionId}] Received invalid API Key ${incomingApiKey}`);

    next(createError(401, 'Service Internal API Key missing or invalid'));
  }
};

export { onebayshoreInternalApiMiddleware };
