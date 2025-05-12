import { createClient, RedisClientType, RedisClientOptions } from 'redis';
import { ConfigurationError } from '../../../lib/errors/config_error';
import { logError, logInfo, logDebug } from '../../../lib/log/util';
import { ConfigManager } from '../../config';

const appConfig = ConfigManager.getAppConfig();

let redisClient: unknown;

export const initializeRedis = async (): Promise<RedisClientType> => {
  try {
    logInfo('Initializing Redis connection');

    const redisConfig = appConfig.redisConfig;

    const REDIS_CLIENT_OPTIONS: RedisClientOptions = {
      url: process.env.REDIS_URL ?? redisConfig.url,
      username: process.env.REDIS_USERNAME ?? redisConfig.username,
      password: process.env.REDIS_PASSWORD || redisConfig.password,
      socket: {
        tls: redisConfig.tlsEnabled,
      },
    };

    if (!redisClient) {
      redisClient = createClient(REDIS_CLIENT_OPTIONS) as RedisClientType;

      await (redisClient as RedisClientType).connect();

      logInfo('New Redis connection established successfully');

      return redisClient as RedisClientType;
    }

    logDebug('Reusing Redis connection successfully');

    return redisClient as RedisClientType;
  } catch (dbErr) {
    logError(`Redis connection failed, reason: ${dbErr.message}`);

    throw new ConfigurationError('Unable to connect to Redis');
  }
};

export const getRedisConnection = async (): Promise<RedisClientType> => {
  if (!redisClient) {
    return await initializeRedis();
  }

  return redisClient as RedisClientType;
};
