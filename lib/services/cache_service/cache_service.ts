import config from 'config';
import ms from 'ms';
import { logDebug, logWarn } from '../../log/util';
import { getRedisConnection } from '../../vendors';

const redisCachePrefix: string = config.get('Services.redis.prefix');

type CacheIdentityType = { serviceName: string; identifier: string };

type ReadPersistedDataType = CacheIdentityType;

type WritePersistDataType = ReadPersistedDataType & {
  expires: '1m' | '5m' | '10m' | '20m' | '1h' | '2h' | '1d' | '3d' | '7d' | '30d' | '60d';
  data:
    | {
        [key: string]: any;
      }
    | {
        [key: string]: any;
      }[];
};

const makeCacheName = (serviceName: string, identifier: string) => {
  return `${redisCachePrefix}:${serviceName}_${identifier}`;
};

const persist = async (transactionId: string, writeCacheProps: WritePersistDataType): Promise<void> => {
  const redisConnection = await getRedisConnection();

  logDebug(`[${transactionId}] [SERVICE] cache write`);

  const options: {
    EX?: number;
  } = {};

  if (!writeCacheProps.data) {
    logWarn(`[${transactionId}] [SERVICE] caching ignored for empty data`);

    return;
  }

  if (writeCacheProps.expires) {
    const actualExpiryInSeconds = ms(writeCacheProps.expires) / 1000;
    options.EX = Math.round(actualExpiryInSeconds);

    logDebug(`[${transactionId}] [SERVICE] cache writing for ${options.EX} seconds`);
  }

  const cacheName = makeCacheName(writeCacheProps.serviceName, writeCacheProps.identifier);

  await redisConnection.set(cacheName, JSON.stringify(writeCacheProps.data), options);

  logDebug(`[${transactionId}] [SERVICE] cache persisted for ${cacheName}`);
};

const retrieve = async (
  transactionId: string,
  readCacheProps: ReadPersistedDataType,
  ignore?: boolean,
): Promise<unknown> => {
  const redisConnection = await getRedisConnection();

  logDebug(`[${transactionId}] [SERVICE] retrieve cache initiated for ${JSON.stringify(readCacheProps)}`);

  const cacheName = makeCacheName(readCacheProps.serviceName, readCacheProps.identifier);

  try {
    if (ignore) {
      logDebug(`[${transactionId}] [SERVICE] cache ignored for ${JSON.stringify(readCacheProps)}`);

      return null;
    }

    const cachedData = await redisConnection.get(cacheName);

    const parsedData = JSON.parse(cachedData);

    if (!parsedData) {
      throw new Error('Caching: No data or parse error');
    }

    return parsedData;
  } catch (readErr) {
    logWarn(`[${transactionId}] No cached data available for ${cacheName}`);
  }

  return null;
};

const batchRetrieve = async (
  transactionId: string,
  multiReadCacheProps: ReadPersistedDataType[],
  ignore?: boolean,
): Promise<{
  [identifier: string]: {
    [key: string]: any;
  };
} | null> => {
  const redisConnection = await getRedisConnection();

  logDebug(`[${transactionId}] [SERVICE] batchRetrieve initiated`);

  const cacheNames = multiReadCacheProps.map((readCacheProps) =>
    makeCacheName(readCacheProps.serviceName, readCacheProps.identifier),
  );

  try {
    if (ignore) {
      logDebug(`[${transactionId}] [SERVICE] cache ignored for ${JSON.stringify(multiReadCacheProps)}`);

      return {};
    }

    if (multiReadCacheProps.length === 0) {
      logWarn(`[${transactionId}] [SERVICE] batch is empty, early return.`);

      return {};
    }

    const cachedMultiValues = await redisConnection.mGet(cacheNames);

    const cachedResults: {
      [identifier: string]: {
        [key: string]: any;
      };
    } = {};

    cachedMultiValues.forEach((cachedData, idx) => {
      try {
        cachedResults[multiReadCacheProps[idx].identifier] = JSON.parse(cachedData);
      } catch (cacheErr) {
        cachedResults[multiReadCacheProps[idx].identifier] = null;
      }
    });

    return cachedResults;
  } catch (readErr) {
    logWarn(`[${transactionId}] No multiple cached data available, reason: ${readErr.message}`);
  }

  return {};
};

const remove = async (transactionId: string, cacheIdentityProps: CacheIdentityType): Promise<void> => {
  const redisConnection = await getRedisConnection();

  logDebug(`[${transactionId}] [SERVICE] cache clean`);

  const cacheName = makeCacheName(cacheIdentityProps.serviceName, cacheIdentityProps.identifier);

  await redisConnection.del(cacheName);

  logDebug(`[${transactionId}] [SERVICE] cache cleaned successfully`);
};

const batchRemove = async (transactionId: string, multiCacheIdentityProps: CacheIdentityType[]): Promise<void> => {
  const redisConnection = await getRedisConnection();

  logDebug(`[${transactionId}] [SERVICE] batch cache clean`);

  if (multiCacheIdentityProps.length === 0) {
    logWarn(`[${transactionId}] [SERVICE] batch is empty, early return.`);

    return;
  }

  const multiCacheNames = multiCacheIdentityProps.map((cacheIdentityProps) =>
    makeCacheName(cacheIdentityProps.serviceName, cacheIdentityProps.identifier),
  );

  await redisConnection.del(multiCacheNames);

  logDebug(`[${transactionId}] [SERVICE] batch cache cleaned successfully`);
};

const clearAll = async (transactionId: string): Promise<void> => {
  const redisConnection = await getRedisConnection();

  logDebug(`[${transactionId}] [SERVICE] clearAll - force cache clean`);

  const cachedItems = await redisConnection.keys(`${redisCachePrefix}:*`);

  logDebug(`[${transactionId}] [SERVICE] clearAll - found ${cachedItems.length} cached items`);

  if (cachedItems.length === 0) {
    return;
  }

  await redisConnection.del(cachedItems);

  logDebug(`[${transactionId}] [SERVICE] clearAll - removed ${cachedItems.length} cached items SUCCESSFULLY`);
};

const hashPersist = async (
  transactionId: string,
  writeCacheProps: Omit<WritePersistDataType, 'data'> & {
    field: string;
    data: string;
  },
): Promise<void> => {
  const redisConnection = await getRedisConnection();

  logDebug(`[${transactionId}] [SERVICE] [hashPersist] cache write`);

  const options: {
    EX?: number;
  } = {};
  if (!writeCacheProps.data) {
    logWarn(`[${transactionId}] [SERVICE] [hashPersist] caching ignored for empty data`);

    return;
  }

  const actualExpiryInSeconds = ms(writeCacheProps.expires) / 1000;

  options.EX = Math.round(actualExpiryInSeconds);

  logDebug(`[${transactionId}] [SERVICE] [hashPersist] cache writing for ${options.EX} seconds`);

  const cacheName = makeCacheName(writeCacheProps.serviceName, writeCacheProps.identifier);
  const redisKey = `${cacheName}:hash`;
  const redisValue = writeCacheProps.data;

  await redisConnection.hSet(redisKey, {
    [writeCacheProps.field]: redisValue,
  });

  await redisConnection.expire(redisKey, options.EX);

  logDebug(`[${transactionId}] [SERVICE] [hashPersist] cache persisted for ${cacheName}`);
};

const retrieveFromHash = async (
  transactionId: string,
  readCacheProps: ReadPersistedDataType & {
    field: string;
  },
  ignore?: boolean,
): Promise<string | null> => {
  const redisConnection = await getRedisConnection();

  logDebug(
    `[${transactionId}] [SERVICE] [retrieveFromHash] retrieve cache initiated for ${JSON.stringify(readCacheProps)}`,
  );

  const cacheName = makeCacheName(readCacheProps.serviceName, readCacheProps.identifier);

  const redisKey = `${cacheName}:hash`;

  try {
    if (ignore) {
      logDebug(`[${transactionId}] [SERVICE] [retrieveFromHash] cache ignored for ${JSON.stringify(readCacheProps)}`);

      return null;
    }

    const cachedValue = await redisConnection.hGet(redisKey, readCacheProps.field);

    if (!cachedValue) {
      throw new Error('Caching: No data or parse error');
    }

    return cachedValue;
  } catch (readErr) {
    logWarn(
      `[${transactionId}] [SERVICE] [retrieveFromHash] No cached data available for ${cacheName} with ${readCacheProps.field}`,
    );
  }

  return null;
};

export { persist, retrieve, batchRetrieve, remove, batchRemove, clearAll, hashPersist, retrieveFromHash };
