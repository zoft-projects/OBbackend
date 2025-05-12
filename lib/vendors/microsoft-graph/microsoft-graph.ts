import axios from 'axios';
import qs from 'qs';
import { logError, logInfo } from '../../log/util';

const getMicrosoftGraphAccessToken = async (
  clientId: string,
  clientSecret: string,
  tenantId: string,
  transactionId: string,
): Promise<string> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getMicrosoftGraphAccessToken - INITIATED.`);

    const accessTokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const accessTokenEndpointPostData = {
      client_id: clientId,
      scope: 'https://graph.microsoft.com/.default',
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    };
    const response = await axios.post(accessTokenEndpoint, qs.stringify(accessTokenEndpointPostData), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    logInfo(`[${transactionId}] [SERVICE] getMicrosoftGraphAccessToken - Access token retrieved.`);

    return response.data.access_token;
  } catch (getTokenError) {
    logError(`[${transactionId}] getMicrosoftGraphAccessToken - FAILED, reason: ${getTokenError.message}`);

    throw getTokenError;
  }
};

const getSharePointFile = async (
  accessToken: string,
  graphURLPath: string,
  transactionId: string,
): Promise<(string | number)[][]> => {
  try {
    const endpoint = 'https://graph.microsoft.com/' + graphURLPath;

    logInfo(
      `[${transactionId}] [SERVICE] getSharePointFile - Microsoft graph endpoint ${endpoint} being invoked with a get call.`,
    );

    const { data } = await axios.get(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });

    logInfo(
      `[${transactionId}] [SERVICE] getSharePointFile - Microsoft graph endpoint ${endpoint} successfully returned with data of length ${data.values.length}.`,
    );

    return data.values;
  } catch (graphGetError) {
    logError(`[${transactionId}] getSharePointFile - FAILED, reason: ${graphGetError.message}`);

    throw graphGetError;
  }
};

export { getMicrosoftGraphAccessToken, getSharePointFile };
