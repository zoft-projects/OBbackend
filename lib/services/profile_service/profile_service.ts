import axios from 'axios';
import config from 'config';
import { logInfo, logError } from '../../log/util';
import {
  EmployeeConsentFilterType,
  EmployeeConsentType,
  CompetencyCategoryConsumerType,
  CompetencyConsumerType,
  EmployeeCompetencyFilterType,
  EmployeeCompetencyConsumerType,
  EmployeeCompetencyCreateType,
} from '../../types';
import { getSecret } from '../../vendors';

const employeeServiceConfig: {
  endpoint: string;
  apiKeyHeader: string;
  secretKeyName: string;
} = config.get('Services.employeeService');

const getEmployeeConsents = async (
  transactionId: string,
  filters: EmployeeConsentFilterType,
): Promise<EmployeeConsentType[]> => {
  try {
    const apiKey = await getSecret(employeeServiceConfig.secretKeyName);

    logInfo(`[${transactionId}] [SERVICE] getEmployeeConsent - Fetching user from available microservice`);

    const response = await axios.get<EmployeeConsentType[]>(
      `${employeeServiceConfig.endpoint}/api/v1/employee_consent`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
        params: {
          limit: filters.limit,
          employeePsId: filters.employeePsId,
          type: filters.type ? filters.type : undefined,
          lastCursorId: filters.lastCursorId ? filters.lastCursorId : undefined,
        },
      },
    );

    return response.data;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] getEmployeeConsent FAILED, reason: ${error.message}`);

    throw error;
  }
};

const createEmployeeConsent = async (
  transactionId: string,
  payload: EmployeeConsentType,
): Promise<EmployeeConsentType> => {
  try {
    const apiKey = await getSecret(employeeServiceConfig.secretKeyName);

    logInfo(`[${transactionId}] [SERVICE] getEmployeeConsent - Fetching user from available microservice`);

    const response = await axios.post<EmployeeConsentType>(
      `${employeeServiceConfig.endpoint}/api/v1/employee_consent`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    return response.data;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] getEmployeeConsent FAILED, reason: ${error.message}`);

    throw error;
  }
};

const getCompetencies = async (
  transactionId: string,
  categoryId: string,
  jobRoles: string,
): Promise<CompetencyConsumerType[]> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getCompetencies - getting Competencies from employee microservice`);

    const apiKey = await getSecret(employeeServiceConfig.secretKeyName);

    const response = await axios.get<CompetencyConsumerType[]>(
      `${employeeServiceConfig.endpoint}/api/v1/competency/list`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
        params: {
          categoryId,
          jobRoles,
        },
      },
    );

    if (!response.data) {
      throw new Error('failed calling the employee service');
    }

    return response.data;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] getCompetencies FAILED, reason: ${error.message}`);

    throw error;
  }
};

const getCompetenciesCategories = async (
  transactionId: string,
  competencyType: string,
): Promise<CompetencyCategoryConsumerType[]> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] getCompetencies - getting Competencies Categories from employee microservice`,
    );

    const apiKey = await getSecret(employeeServiceConfig.secretKeyName);

    const response = await axios.get<CompetencyCategoryConsumerType[]>(
      `${employeeServiceConfig.endpoint}/api/v1/competency_category/list`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
        params: {
          competencyType,
        },
      },
    );

    if (!response.data) {
      throw new Error('failed calling the employee service');
    }

    return response.data;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] getCompetenciesCategories FAILED, reason: ${error.message}`);

    throw error;
  }
};

const getEmployeeCompetencies = async (
  transactionId: string,
  filters: EmployeeCompetencyFilterType,
): Promise<EmployeeCompetencyConsumerType[]> => {
  try {
    const apiKey = await getSecret(employeeServiceConfig.secretKeyName);

    logInfo(`[${transactionId}] [SERVICE] getEmployeeCompetencies - Fetching user from employee microservice`);

    const response = await axios.get<EmployeeCompetencyConsumerType[]>(
      `${employeeServiceConfig.endpoint}/api/v1/employee_competency/`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
        params: {
          limit: filters.limit,
          employeePsId: filters.employeePsId,
          showCertificates: true,
          showCompetencyDetails: true,
          lastCursorId: filters.lastCursorId ? filters.lastCursorId : undefined,
        },
      },
    );

    return response.data;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] getEmployeeCompetencies FAILED, reason: ${error.message}`);

    throw error;
  }
};

const createEmployeeCompetency = async (
  transactionId: string,
  employeePsId: string,
  employeeCompetency: EmployeeCompetencyCreateType,
): Promise<{
  success?: boolean;
  data?: {
    id?: string;
  };
}> => {
  try {
    const apiKey = await getSecret(employeeServiceConfig.secretKeyName);

    logInfo(
      `[${transactionId}] [SERVICE] createEmployeeCompetency - Creating Employee Competency from employee microservice`,
    );

    const response = await axios.post(
      `${employeeServiceConfig.endpoint}/api/v1/employee_competency/${employeePsId}/`,
      employeeCompetency,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    return response.data;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] createEmployeeCompetency FAILED, reason: ${error.message}`);

    throw error;
  }
};

const updateEmployeeCompetency = async (
  transactionId: string,
  employeePsId: string,
  employeeCompetency: EmployeeCompetencyCreateType,
): Promise<{
  success?: boolean;
  data?: {
    id?: string;
  };
}> => {
  try {
    const apiKey = await getSecret(employeeServiceConfig.secretKeyName);

    logInfo(
      `[${transactionId}] [SERVICE] updateEmployeeCompetency - Updating Employee Competency from employee microservice`,
    );

    const response = await axios.put(
      `${employeeServiceConfig.endpoint}/api/v1/employee_competency/${employeePsId}/competency/${employeeCompetency.competencyId}/`,
      employeeCompetency,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    return response.data;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] updateEmployeeCompetency FAILED, reason: ${error.message}`);

    throw error;
  }
};

const deleteEmployeeCompetency = async (
  transactionId: string,
  employeePsId: string,
  competencyId: string,
): Promise<{ success?: boolean }> => {
  try {
    const apiKey = await getSecret(employeeServiceConfig.secretKeyName);

    logInfo(
      `[${transactionId}] [SERVICE] deleteEmployeeCompetency - Deleting Employee Competency from employee microservice`,
    );

    const response = await axios.delete(
      `${employeeServiceConfig.endpoint}/api/v1/employee_competency/${employeePsId}/competency/${competencyId}/`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    return response.data;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] deleteEmployeeCompetency FAILED, reason: ${error.message}`);

    throw error;
  }
};

export {
  getEmployeeConsents,
  createEmployeeConsent,
  getCompetencies,
  getCompetenciesCategories,
  getEmployeeCompetencies,
  createEmployeeCompetency,
  updateEmployeeCompetency,
  deleteEmployeeCompetency,
};
