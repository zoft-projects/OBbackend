import mongoose from 'mongoose';
import { logError, logInfo, logDebug } from '../../../lib/log/util';
import { ConfigManager } from '../../config';
import { getSecret } from '../aws/secret_manager';

type MongooseConnection = typeof mongoose;

let connection: MongooseConnection;
const appConfig = ConfigManager.getAppConfig();

export const initializeMongoDb = async (): Promise<MongooseConnection | undefined> => {
  try {
    logInfo('Initializing Mongo connection');

    if (!connection) {
      const connectionUrl =
        appConfig.envConfig.name === 'local' ? appConfig.mongoConfig : await getSecret('Mongodb-Uri');

      mongoose.set('strictQuery', true);
      connection = await mongoose.connect(connectionUrl as string);

      logInfo('New Mongo connection established successfully');

      return connection;
    }

    logDebug('Reusing Mongo connection successfully');

    return connection;
  } catch (dbErr) {
    logError(`Mongo connection failed, reason: ${dbErr.message}`);
  }
};
