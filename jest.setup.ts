import { quickBloxCreateSession, getRedisMockConnection } from './lib/vendors/mocks';

jest.mock('./lib/vendors/firebase/firebase_remote_config', () => ({
  initializeFirebase: jest.fn(),
  updateRemoteConfigTemplate: jest.fn(),
  getValuesFromRemoteConfig: jest.fn(),
  publishRemoteConfigDefaults: jest.fn(),
}));

/* quickBloxCreateSession must be called in the mock of this module as 
createSession in invoked in the quickblox_vendor module */
jest.mock('./lib/vendors/quickblox/quickblox_vendor', () => {
  quickBloxCreateSession();

  return {
    createSession: jest.fn().mockImplementation(quickBloxCreateSession),
  };
});

jest.mock('./lib/vendors/redis/redis_vendor', () => {
  return {
    getRedisConnection: jest.fn().mockImplementation(() => {
      return { ...getRedisMockConnection, del: jest.fn() };
    }),
    initializeRedis: jest.fn(),
  };
});

jest.mock('./lib/vendors/aws/secret_manager', () => {
  return {
    getSecret: jest.fn().mockImplementation(async (inputStr: string) => {
      return `${inputStr}_secret`;
    }),
  };
});
