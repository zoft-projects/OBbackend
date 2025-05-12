import { EmployeePingIdentity } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import { TokenValidator } from '@bayshore-healthcare/lib-ping-authentication-middleware/dist/lib/authentication/token_validator';
import axios from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Mongoose from 'mongoose';
import ms from 'ms';
import request from 'supertest';

import { App } from '../app';
import { ConfigManager } from '../lib/config';
import * as ControllerModules from '../lib/controllers';
import { RemoteConfigFileNameEnum, BranchFeaturesProvisionEnum, TempDataValueEnum } from '../lib/enums';
import { AuthError } from '../lib/errors/auth_error';
import { pingIdentityFactory, userFactory, branchFactory } from '../lib/factories';
import { logInfo } from '../lib/log/util';
import { OBBranchModel, OBUserModel, OBTempDataModel } from '../lib/models';
import { cacheService, userService } from '../lib/services';
import {
  ProcuraEmployeePayloadType,
  OBUserSchemaType,
  OBBranchSchemaType,
  OBFeatureProvisionSchemaType,
} from '../lib/types';
import { createNanoId } from '../lib/utils';

let mongoServer: MongoMemoryServer;

const mockTransactionId = 'MockTransactionId';

const connectDB = async (): Promise<typeof Mongoose> => {
  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create();
  }

  const uri = mongoServer.getUri();

  Mongoose.set('strictQuery', false);

  const mongooseConnection = await Mongoose.connect(uri);

  return mongooseConnection;
};

const disconnectDB = async (): Promise<void> => {
  if (mongoServer) {
    await Mongoose.disconnect();

    await mongoServer.stop();
  }
};

const dropDb = async (): Promise<void> => {
  if (mongoServer) {
    await Mongoose.connection.dropDatabase();
    await Mongoose.connection.close();

    await mongoServer.stop();
  }
};

const dropCollections = async (): Promise<void> => {
  if (mongoServer) {
    const collections = await Mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.drop();
    }
  }
};

type MongooseConnectionType = typeof Mongoose;

const mockEmployeePingIdentity = async (
  pingIdentityProps?: { [key: string]: string | string[] | number | boolean },
  overriddenFirstName?: string,
  overriddenCity?: string,
  isExpired = false,
): Promise<void> => {
  const tokenExpiresInMs = isExpired ? -1 * ms('30s') : ms('30s');

  jest.spyOn(TokenValidator.prototype, 'validateAccessToken').mockImplementation(async () => {
    if (isExpired) {
      throw new AuthError('Access token invalid');
    }

    return EmployeePingIdentity.fromJson(
      pingIdentityFactory.generateRandomPingIdentityJson(
        pingIdentityProps,
        overriddenFirstName,
        overriddenCity,
        tokenExpiresInMs,
      ),
    );
  });
};

// Must mock this method as it uses Employee Service
const mockGetMultipleProcuraDetailFromEmployeeService = async (overriddenEmployeeIds: string[]): Promise<void> => {
  jest.spyOn(userService, 'getMultipleProcuraDetailFromEmployeeService').mockImplementation(async () => {
    const validEmployeeList: ProcuraEmployeePayloadType[] = overriddenEmployeeIds.map((overriddenEmployeeId) => {
      return {
        employeeId: 'M0000123456',
        tenantId: 'Procura_Leapfrog',
        systemType: 'procura',
        employeePsId: overriddenEmployeeId,
      };
    });

    await cacheService.persist(mockTransactionId, {
      serviceName: 'procuraEmployeeService',
      identifier: validEmployeeList[0].employeePsId,
      data: validEmployeeList,
      expires: '1d',
    });

    logInfo('[SERVICE] getProcuraDetailFromEmployeeService SUCCESSFUL');

    return validEmployeeList;
  });
};

// TODO: mocking this in this way can cause issues as getObUsersByPsId is used in various places, and this is unnecessary to call.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockGetObUsersByPsId = async (mockedUser: OBUserSchemaType): Promise<void> => {
  jest.spyOn(userService, 'getObUsersByPsId').mockImplementation(async () => {
    return mockedUser;
  });
};

const getApiService: () => request.SuperTest<request.Test> = (() => {
  const Controllers = Object.values(ControllerModules);
  const appConfig = ConfigManager.getAppConfig();

  const app = new App(
    Controllers.map((Controller) => new Controller(appConfig)),
    process.env.SERVER_PORT || appConfig.envConfig.port || '8080',
    appConfig,
  );

  const restRequest = request(app.app);

  return () => restRequest;
})();

const mockApiMiddlewares = async (user: OBUserSchemaType, branch: OBBranchSchemaType, isTokenExpired = false) => {
  await Promise.all([
    // Mock ping authorization
    mockEmployeePingIdentity(
      { employeeID: user.employeePsId },
      user.workEmail.split(/@/)[0],
      branch.city,
      isTokenExpired,
    ),
    // Mock call from Employee microservice
    mockGetMultipleProcuraDetailFromEmployeeService([user.employeePsId]),
  ]);
};

type UserForAuthType = Pick<OBUserSchemaType, 'employeePsId' | 'workEmail'>;

const getAuthHeaders = async (
  options: { overrideUser?: UserForAuthType; isExpired?: boolean } = {
    overrideUser: undefined,
    isExpired: false,
  },
): Promise<string> => {
  const branch = branchFactory.generateRandomBranchDBEntry();

  const user = userFactory.generateRandomUserDBEntry({
    branchAccess: { canAccessAll: true, hasMultiple: true, selectedBranchIds: [branch.branchId] },
    ...(options.overrideUser ?? null),
  });

  await new OBBranchModel(branch).save();
  await new OBUserModel(user).save();
  await mockApiMiddlewares(user, branch, options.isExpired);

  return createNanoId(36);
};

const getMockAxios = (() => {
  const mockAxios = new AxiosMockAdapter(axios);

  return () => mockAxios;
})();

const getFeatureProvisions = async (
  featureProvisions: Partial<OBFeatureProvisionSchemaType> = { branchOverrides: {}, defaultForBranches: {} },
): Promise<OBFeatureProvisionSchemaType> => {
  const makeFeatureProvisions = (): OBFeatureProvisionSchemaType => {
    return {
      branchOverrides: {
        '99': {
          [BranchFeaturesProvisionEnum.IdBadge]: true,
        },
        ...(featureProvisions.branchOverrides ?? null),
      },
      defaultForBranches: {
        [BranchFeaturesProvisionEnum.IdBadge]: false,
        ...(featureProvisions.defaultForBranches ?? null),
      },
    };
  };

  const currentProvisions = makeFeatureProvisions();

  await new OBTempDataModel({
    version: '1.0.0',
    primaryIdentifier: RemoteConfigFileNameEnum.BranchFeatureProvisioning,
    valueType: TempDataValueEnum.RemoteConfig,
    payload: currentProvisions,
  }).save();

  return currentProvisions;
};

export {
  connectDB,
  dropDb,
  dropCollections,
  disconnectDB,
  getApiService,
  getAuthHeaders,
  getMockAxios,
  getFeatureProvisions,
  mockTransactionId,
};
export type { MongooseConnectionType };
