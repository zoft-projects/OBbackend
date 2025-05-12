/* eslint-disable complexity */
import { AlertType, IAlertConfig } from '@bayshore-healthcare/lib-error-middleware';
import { ILoggerConfig } from '@bayshore-healthcare/lib-logger';
import config from 'config';
import { VendorEnum } from './enums/vendor';
import { ConfigurationError } from './errors/config_error';

type TVendorConfig = IMongoConfig | IRedisConfig;

export class ConfigManager {
  private static getVendorConfig(vendor: VendorEnum): TVendorConfig {
    switch (vendor) {
      case VendorEnum.Mongo: {
        const configPath = 'Services.mongo';
        const { url, dbName } = config.get(configPath) as IConfigProperties;

        if (!url || !dbName) {
          return '';
        }

        const connectionUrl = `${url}/${dbName}`;

        return connectionUrl;
      }
      case VendorEnum.Redis: {
        const configPath = 'Services.redis';
        const { url, username, password, tlsEnabled, maxRetries } = config.get(configPath) as IConfigProperties;

        const connectionProperties = {
          url,
          username,
          password,
          tlsEnabled: Boolean(tlsEnabled),
          maxRetries: +maxRetries,
        };

        return connectionProperties as TVendorConfig;
      }
      default:
        throw new ConfigurationError(`Configuration Manager is unaware about the vendor: ${vendor}`);
    }
  }

  private static isStringArray(array: any): boolean {
    return Array.isArray(array) && array.filter((item) => typeof item !== 'string').length === 0;
  }

  private static getAuthConfig(): IAuthConfig {
    const openEndpoints = config.get('Environment.openEndpoints') as string[];
    const lockedEndpoints = config.get('Environment.lockedEndpoints') as string[];
    const internalApiKey = config.get('Environment.internalApiKey') as string;

    if (!this.isStringArray(openEndpoints)) {
      throw new ConfigurationError('Environment -> openEndpoints should be string array');
    }

    if (!this.isStringArray(lockedEndpoints)) {
      throw new ConfigurationError('Environment -> lockedEndpoints should be string array');
    }

    const authConfig = {
      openEndpoints,
      lockedEndpoints,
      internalApiKey,
    };

    return authConfig;
  }

  private static getAlertConfig(): IAlertConfig {
    const recipients = config.get('ErrorAlert.recipients') as string[];

    if (!this.isStringArray(recipients)) {
      throw new ConfigurationError('ErrorAlert -> recipients should be string array');
    }

    const { name, serviceName } = config.get('Environment') as IConfigProperties;
    const { source } = config.get('ErrorAlert') as IConfigProperties;

    if (!name || !source || !serviceName) {
      throw new ConfigurationError('Please add all required configuration for Error Alerts');
    }

    const alertConfig = {
      alertType: [AlertType.SES],
      recipients,
      appEnv: name,
      appName: serviceName,
      source,
    };

    return alertConfig;
  }

  public static getEnvConfig(): IEnvConfig {
    const accessAllowedFrom = config.get('Environment.accessAllowedFrom') as string[];
    const port = config.get('Environment.port') as number;

    if (!this.isStringArray(accessAllowedFrom)) {
      throw new ConfigurationError('Environment -> accessAllowedFrom should be string array');
    }

    const { name, apiBase, serviceName, serviceInternalApiKey } = config.get('Environment') as IConfigProperties;

    if (!name || !apiBase || !serviceName) {
      throw new ConfigurationError('Please add all required configuration for the environment');
    }

    const envConfig: IEnvConfig = {
      name,
      port: port.toString(),
      accessAllowedFrom,
      apiBase,
      serviceName,
      serviceInternalApiKey,
    };

    return envConfig;
  }

  public static getAppConfig(): IAppConfig {
    // All application configurations should go here
    return {
      authConfig: this.getAuthConfig(),
      // mongoConfig: this.getMongoConfig(),
      envConfig: this.getEnvConfig() as IEnvConfig,
      alertConfig: this.getAlertConfig() as IAlertConfig,
      mongoConfig: this.getVendorConfig(VendorEnum.Mongo) as IMongoConfig,
      redisConfig: this.getVendorConfig(VendorEnum.Redis) as IRedisConfig,
    };
  }

  public static getLoggerConfig(): ILoggerConfig {
    const auditLogExcludedPaths = config.get('Environment.auditLogExcludedPaths') as string[];
    const { name, serviceName } = config.get('Environment') as IConfigProperties;

    if (!name || !serviceName || !this.isStringArray(auditLogExcludedPaths)) {
      throw new ConfigurationError('Please add all required configuration for the environment');
    }

    const loggerConfig = {
      name,
      serviceName,
      auditLogExcludedPaths,
    };

    return loggerConfig;
  }
}

export interface IAppConfig {
  authConfig: IAuthConfig;
  // mongoConfig: IMongoConfig;
  envConfig: IEnvConfig;
  alertConfig: IAlertConfig;
  mongoConfig: IMongoConfig;
  redisConfig: IRedisConfig;
}

export interface IEnvConfig {
  name: string;
  port: string;
  accessAllowedFrom: string[];
  apiBase: string;
  serviceName: string;
  serviceInternalApiKey: string;
}

export interface IAuthConfig {
  openEndpoints: string[];
  // lockedEndpoints: string[];
  // internalApiKey: string;
}

export interface ICognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  tokenExpiration: number;
}

export type IMongoConfig =
  | string
  | {
      uri: string;
      dbName: string;
      ssl: boolean;
      logLevel: string;
    };

export type IRedisConfig = {
  url: string;
  username: string;
  password: string;
  tlsEnabled: boolean;
  maxRetries: number;
};

interface IConfigProperties {
  [key: string]: string;
}
