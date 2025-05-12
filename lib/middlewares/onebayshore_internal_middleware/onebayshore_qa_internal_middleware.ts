import config from 'config';
import express from 'express';
import createError from 'http-errors';

import { logWarn, logInfo } from '../../log/util';
import { getSecret } from '../../vendors';

const { qaApiKeyKeyHeader }: { qaApiKeyKeyHeader: string } = config.get('Services.onebayshore');

const getInternalApiKey = (() => {
  let apiKey: string = null;

  return async (): Promise<string> => {
    if (apiKey) {
      return apiKey;
    }
    apiKey = await getSecret(qaApiKeyKeyHeader);

    return apiKey;
  };
})();

const getIncomingApiKey = (req: express.Request) => req.get(qaApiKeyKeyHeader.toLowerCase());

const qaInternalApiMiddleware = async (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
): Promise<void> => {
  const transactionId = req.txId;
  const incomingApiKey = getIncomingApiKey(req);
  const expectedApiKey = await getInternalApiKey();

  if (incomingApiKey === expectedApiKey) {
    logInfo(`[${transactionId}] Validated QA internal authentication using API Key successfully`);
    next();
  } else {
    logWarn(`[${transactionId}] Received invalid API Key ${incomingApiKey}`);

    next(createError(401, 'Service Internal API Key missing or invalid'));
  }
};

export { qaInternalApiMiddleware };
