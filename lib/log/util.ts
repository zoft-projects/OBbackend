import {
  getAuditLogMiddleware as auditLog,
  getLogger as getLoggerInLib,
  ILoggerConfig,
} from '@bayshore-healthcare/lib-logger';
import config from 'config';
import { ConfigManager } from '../../lib/config';

const loggerConfig: ILoggerConfig = ConfigManager.getLoggerConfig();
const logger = getLoggerInLib(loggerConfig);

const environment = config.get('Environment.name');

if (environment === 'qa' && process.argv.includes('--silent')) {
  logger.transports.forEach((transport) => {
    transport.silent = true;
  });
}

export const getAuditLogMiddleware = (): any => auditLog(loggerConfig);

export function logInfo(message: string, ...meta: Record<string, unknown>[]): void {
  logger.info(message, meta);
}

export function logError(message: string, ...err: Record<string, unknown>[]): void {
  logger.error(message, err);
}

export function logWarn(message: string): void {
  logger.warn(message);
}

export function logDebug(message: string): void {
  logger.debug(message);
}

export const getLogger = (): any => logger;
