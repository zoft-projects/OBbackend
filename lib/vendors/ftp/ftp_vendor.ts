import config from 'config';
import ms from 'ms';
import SftpClient from 'ssh2-sftp-client';
import { VendorEnum } from '../../enums';
import { logError, logInfo } from '../../log/util';
import { getSecret } from '../aws/secret_manager';
const {
  credentialKey,
  host,
  port,
  folderPath,
}: { credentialKey: string; host: string; port: string; folderPath: string } = config.get('Services.itServiceFtp');

type FtpVendorResponseType = {
  ftpResponseCode: number;
  ftpResponseMessage: string;
};

const initializeFtpAndTest = async (): Promise<void> => {
  const [ftpUsername, ftpPassword] = ((await getSecret(credentialKey)) || '').split('|');
  const client = new SftpClient();
  logInfo(`[${VendorEnum.Ftp}] server: ${host}`);
  try {
    await client.connect({
      host,
      username: ftpUsername,
      password: ftpPassword,
      port: parseInt(port),
      readyTimeout: ms('10s'),
    });
    const pathValid = await client.exists(folderPath);
    if (!pathValid) {
      throw new Error(`[${VendorEnum.Ftp}] initializeFtpAndTest - ERROR folderPath non-existent in remote client.`);
    }
    const clientList = await client.list(folderPath);

    logInfo(
      `[${
        VendorEnum.Ftp
      }] initializeFtpAndTest - connection secured to remote folder: ${folderPath} with working directory list: ${JSON.stringify(
        clientList || null,
      )}`,
    );

    await client.end();
  } catch (err) {
    logError(`[${VendorEnum.Ftp}] initializeFtpAndTest - ERROR in connecting through ftp: ${err}`);
    throw err;
  }
};

export { initializeFtpAndTest, FtpVendorResponseType };
