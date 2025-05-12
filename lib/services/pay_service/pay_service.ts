import axios from 'axios';
import config from 'config';
import { logInfo, logError } from '../../log/util';
import { getSecret } from '../../vendors';

const n8nServiceConfig: {
  endpoint: string;
  summaryIdentifier: string;
  stubIdentifier: string;
  user: string;
  secretKeyName: string;
} = config.get('Services.n8nService');

/**
 * THIS SERVICE HANDLES SENSITIVE INFORMATION AND LOGS SHOULD NOT REVEAL ANY PII/PSI
 * ONLY TIMESTAMP OF REQUEST AND ERRORS WHEN FAILED SHOULD BE LOGGED HERE
 */

type PaySummariesConsumerResponseType = {
  employeeId: string;
  name: string;
  streetAddress: string;
  payPeriods: {
    payEnd: string;
    checkTime: string;
    paycheckNbr: number;
    totalGross: number;
    totalTaxes: number;
    totalDeductions: number;
    netPay: number;
  }[];
};

const getPaySummaries = async (
  transactionId: string,
  employeePsId: string,
  authToken: string,
): Promise<PaySummariesConsumerResponseType> => {
  logInfo(`[${transactionId}] [SERVICE] [getPaySummaries] Requested for employeePsId: ${employeePsId}`);

  try {
    const paySummaryEndpoint = `${n8nServiceConfig.endpoint}/${n8nServiceConfig.summaryIdentifier}/n8n/payroll/pay/employee/${employeePsId}`;
    const passcode = await getSecret(n8nServiceConfig.secretKeyName);

    const [, authTokenSuffix] = authToken.split(' ');

    const paySummaryResponse = await axios.get<PaySummariesConsumerResponseType>(paySummaryEndpoint, {
      auth: {
        username: n8nServiceConfig.user,
        password: passcode,
      },
      headers: {
        Identity: authTokenSuffix,
        'Content-Type': 'application/json',
      },
    });

    return paySummaryResponse.data;
  } catch (fetchErr) {
    logError(
      `[${transactionId}] [SERVICE] [getPaySummaries] Failed for employeePsId: ${employeePsId}, reason: ${fetchErr.message}`,
    );

    throw fetchErr;
  }
};

const getPayStub = async (
  transactionId: string,
  employeePsId: string,
  payCheckId: string,
  authToken: string,
): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] [getPayStub] Requested for employeePsId: ${employeePsId}`);

  try {
    const payStubEndpoint = `${n8nServiceConfig.endpoint}/${n8nServiceConfig.stubIdentifier}/n8n/payroll/pay/employee/${employeePsId}/stub/${payCheckId}`;
    const passcode = await getSecret(n8nServiceConfig.secretKeyName);

    const [, authTokenSuffix] = authToken.split(' ');

    const payStubResponse = await axios.get<string>(payStubEndpoint, {
      auth: {
        username: n8nServiceConfig.user,
        password: passcode,
      },
      headers: {
        Identity: authTokenSuffix,
        'Content-Type': 'application/json',
      },
    });

    return payStubResponse.data;
  } catch (fetchErr) {
    logError(
      `[${transactionId}] [SERVICE] [getPayStub] Failed for employeePsId: ${employeePsId} and id: ${payCheckId}, reason: ${fetchErr.message}`,
    );
  }
};

export { getPaySummaries, getPayStub };
