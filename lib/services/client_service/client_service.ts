import axios, { AxiosResponse } from 'axios';
import config from 'config';
import { format } from 'date-fns';
import ms from 'ms';
import { multiMediaService, tempDataService } from '..';
import { ActiveStateEnum, FileTransportEnum, S3FoldersEnum, TempDataValueEnum } from '../../enums';
import { logError, logInfo } from '../../log/util';
import { ClientFromSystemType, ClientAddedEntitiesFromSystemType, FileBufferDataType } from '../../types';
import { createPresignedUrlWithClient, deleteFileFromS3, getSecret } from '../../vendors';
import * as cacheService from '../cache_service/cache_service';
import { deleteTempData, getTempDataByFilter } from '../temp_data_service/temp_data_service';

const clientServiceConfig: { endpoint: string; apiKeyHeader: string } = config.get('Services.clientService');
const { timeThresholdToDeleteWellnessImages }: { timeThresholdToDeleteWellnessImages: string } =
  config.get('Features.wellnessImages');

// Client details are related to the active visits
const getClientDetailByClientPsIds = async (
  transactionId: string,
  clientPsIds: string[],
): Promise<ClientFromSystemType[]> => {
  const clientApiKey = await getSecret('User-Service-Internal-Api-Key');

  if (!clientPsIds?.length) {
    throw new Error('Provide client ps ids for client details.');
  }

  const cachedResults = await cacheService.batchRetrieve(
    transactionId,
    clientPsIds.map((clientPsId) => ({
      serviceName: 'clientService',
      identifier: `${clientPsId}`,
    })),
  );

  const results: ClientFromSystemType[] = [];
  const pendingClientPsIds: string[] = [];

  clientPsIds.forEach((clientPsId) => {
    if (cachedResults[clientPsId]) {
      results.push(cachedResults[clientPsId] as ClientFromSystemType);
    } else {
      pendingClientPsIds.push(clientPsId);
    }
  });

  if (pendingClientPsIds.length === 0) {
    return results;
  }

  logInfo(
    `[${transactionId}] [SERVICE] [getClientDetailByClientPsIds] Get client details initiated for psIds: ${JSON.stringify(
      pendingClientPsIds,
    )}`,
  );

  const idParams = pendingClientPsIds.join(',');

  const response: AxiosResponse<{ clients: ClientFromSystemType[] }> = await axios.get(
    `${clientServiceConfig.endpoint}/api/v1/internal/clients?id=${idParams}&clientIds=&tenantIds=`,
    {
      headers: {
        'Content-Type': 'application/json',
        [clientServiceConfig.apiKeyHeader]: clientApiKey,
      },
    },
  );

  if (!response.data?.clients || !Array.isArray(response.data.clients)) {
    logError(
      `[${transactionId}] [SERVICE] [getClientDetailByClientPsIds] Get client details error, received bad data: ${JSON.stringify(
        response.data || null,
      )}`,
    );

    throw new Error('Client details response error');
  }

  logInfo(
    `[${transactionId}] [SERVICE] [getClientDetailByClientPsIds] Get client details SUCCESSFUL for psIds: ${JSON.stringify(
      clientPsIds,
    )}, received length: ${response.data.clients.length}`,
  );

  return [...results, ...response.data.clients];
};

const getClientDetailByClientAndTenantIds = async (
  transactionId: string,
  clientIdentifiers: { clientId: string; tenantId: string }[],
): Promise<ClientFromSystemType[]> => {
  const clientApiKey = await getSecret('User-Service-Internal-Api-Key');

  if (!clientIdentifiers?.length) {
    throw new Error('Provide client ids and tenant ids for client details.');
  }

  const results: ClientFromSystemType[] = [];

  const cachedResults = await cacheService.batchRetrieve(
    transactionId,
    clientIdentifiers.map(({ clientId, tenantId }) => ({
      serviceName: 'clientService',
      identifier: `${clientId}_${tenantId}`,
    })),
  );

  const pendingClientIdentifiers: { clientId: string; tenantId: string }[] = [];

  clientIdentifiers.forEach(({ clientId, tenantId }) => {
    if (cachedResults[`${clientId}_${tenantId}`]) {
      results.push(cachedResults[`${clientId}_${tenantId}`] as ClientFromSystemType);
    } else {
      pendingClientIdentifiers.push({ clientId, tenantId });
    }
  });

  if (pendingClientIdentifiers.length === 0) {
    return results;
  }

  const clientIds = pendingClientIdentifiers.map(({ clientId }) => clientId);
  const tenantIds = [...new Set(pendingClientIdentifiers.map(({ tenantId }) => tenantId))];

  logInfo(
    `[${transactionId}] [SERVICE] [getClientDetailByClientAndTenantIds] Get client details initiated for tenantIds: ${JSON.stringify(
      tenantIds,
    )} and clientIds: ${JSON.stringify(clientIds)}`,
  );

  const response: AxiosResponse<{ clients: ClientFromSystemType[] }> = await axios.get(
    `${clientServiceConfig.endpoint}/api/v1/internal/clients`,
    {
      headers: {
        'Content-Type': 'application/json',
        [clientServiceConfig.apiKeyHeader]: clientApiKey,
      },
      params: {
        id: '',
        clientIds: clientIds.join(','),
        tenantIds: tenantIds.join(','),
      },
    },
  );

  if (!response.data?.clients || !Array.isArray(response.data.clients)) {
    logError(
      `[${transactionId}] [SERVICE] [getClientDetailByClientAndTenantIds] Get client details error, received bad data: ${JSON.stringify(
        response.data || null,
      )}`,
    );

    throw new Error('Client details response error');
  }

  logInfo(
    `[${transactionId}] [SERVICE] [getClientDetailByClientAndTenantIds] Get client details SUCCESSFUL for clientIds: ${JSON.stringify(
      clientIds,
    )}, received length: ${response.data.clients.length}`,
  );

  const cachePromises: Promise<void>[] = [];

  response.data.clients.forEach((client) => {
    cachePromises.push(
      cacheService.persist(transactionId, {
        serviceName: 'clientService',
        identifier: `${client.clientId}_${client.tenantId}`,
        data: client,
        expires: '10m',
      }),
    );
  });

  await Promise.all(cachePromises);

  return [...results, ...response.data.clients];
};

const getClientAdditionalEntitiesByClientAndTenantIds = async (
  transactionId: string,
  clientIdentifiers: { clientId: string; tenantId: string }[],
): Promise<ClientAddedEntitiesFromSystemType[]> => {
  const clientApiKey = await getSecret('User-Service-Internal-Api-Key');

  if (!clientIdentifiers?.length) {
    throw new Error('Provide client ids and tenant ids for client details.');
  }

  const results: ClientAddedEntitiesFromSystemType[] = [];

  const cachedResults = await cacheService.batchRetrieve(
    transactionId,
    clientIdentifiers.map(({ clientId, tenantId }) => ({
      serviceName: 'clientAddedEntitiesService',
      identifier: `${clientId}_${tenantId}`,
    })),
  );

  const pendingClientIdentifiers: { clientId: string; tenantId: string }[] = [];

  clientIdentifiers.forEach(({ clientId, tenantId }) => {
    if (cachedResults[`${clientId}_${tenantId}`]) {
      results.push(cachedResults[`${clientId}_${tenantId}`] as ClientAddedEntitiesFromSystemType);
    } else {
      pendingClientIdentifiers.push({ clientId, tenantId });
    }
  });

  if (pendingClientIdentifiers.length === 0) {
    return results;
  }

  const clientIds = pendingClientIdentifiers.map(({ clientId }) => clientId);
  const tenantIds = [...new Set(pendingClientIdentifiers.map(({ tenantId }) => tenantId))];

  logInfo(
    `[${transactionId}] [SERVICE] [getClientAdditionalEntitiesByClientAndTenantIds] Get client details initiated for tenantIds: ${JSON.stringify(
      tenantIds,
    )} and clientIds: ${JSON.stringify(clientIds)}`,
  );

  const response: AxiosResponse<{ clients: ClientAddedEntitiesFromSystemType[] }> = await axios.get(
    `${clientServiceConfig.endpoint}/api/v1/internal/clients/details`,
    {
      headers: {
        'Content-Type': 'application/json',
        [clientServiceConfig.apiKeyHeader]: clientApiKey,
      },
      params: {
        clientIds: clientIds.join(','),
        tenantIds: tenantIds.join(','),
      },
    },
  );

  if (!Array.isArray(response.data)) {
    logError(
      `[${transactionId}] [SERVICE] [getClientAdditionalEntitiesByClientAndTenantIds] Get client details error, received bad data: ${JSON.stringify(
        response.data || null,
      )}`,
    );

    throw new Error('Client details response error');
  }

  logInfo(
    `[${transactionId}] [SERVICE] [getClientAdditionalEntitiesByClientAndTenantIds] Get client details SUCCESSFUL for clientIds: ${JSON.stringify(
      clientIds,
    )}, received length: ${response.data.length}`,
  );

  const cachePromises: Promise<void>[] = [];

  response.data.forEach((client) => {
    cachePromises.push(
      cacheService.persist(transactionId, {
        serviceName: 'clientAddedEntitiesService',
        identifier: `${client.clientId}_${client.tenantId}`,
        data: client,
        expires: '20m',
      }),
    );
  });

  await Promise.all(cachePromises);

  return [...results, ...response.data];
};

const storeClientWellnessImageInS3 = async (
  transactionId: string,
  wellnessImageDetails: {
    user: string;
    clientId: string;
    imageBuffer: FileBufferDataType;
  },
): Promise<string> => {
  const bucketNameS3: string = config.get('Services.s3.bucketName');

  try {
    logInfo(`[${transactionId}] [SERVICE] [storeClientWellnessImageInS3] Storing wellness image`);

    const currentDate = format(new Date(), 'yyyy-MM-dd-HH-mm');

    const suffix = wellnessImageDetails.imageBuffer.mimetype.match(/\/([a-zA-Z0-9]+)$/); // This gets the file ending i.e., .png, .jpg, etc.
    const fileName = `cl_${wellnessImageDetails.clientId}/${currentDate}.${suffix ? suffix[1] : ''}`;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { storedFileName, versionId } = await multiMediaService.storeMultiMedia(
      transactionId,
      {
        type: FileTransportEnum.Buffer,
        image: { bucketName: bucketNameS3, buffer: wellnessImageDetails.imageBuffer },
      },
      S3FoldersEnum.WellnessImage,
      fileName,
    );

    const presignedUrl = await createPresignedUrlWithClient(transactionId, storedFileName, Math.floor(ms('1d') / 1000));

    logInfo(
      `[${transactionId}] [SERVICE] [storeClientWellnessImageInS3] image name: ${storedFileName} stored to S3, presignedUrl retrieved, adding to tempData`,
    );

    tempDataService.addTempData(transactionId, {
      primaryIdentifier: storedFileName,
      valueType: TempDataValueEnum.WellnessImage,
      payload: {
        versionId,
      },
      valueStatus: ActiveStateEnum.Active,
      createdAt: new Date(),
    });

    logInfo(
      `[${transactionId}] [SERVICE] [storeClientWellnessImageInS3] stored image name: ${storedFileName} to tempData`,
    );

    logInfo(
      `[${transactionId}] [SERVICE] [storeClientWellnessImageInS3] SUCCESSFUL, for client: ${wellnessImageDetails.clientId}`,
    );

    return presignedUrl;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] [storeClientWellnessImageInS3] Failed to create note: ${err.message}`);
    throw err;
  }
};

const removeWellnessImages = async (transactionId: string): Promise<number> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] [removeWellnessImages] Storing wellness image`);

    const date24HoursAgo = new Date(Date.now() - ms(timeThresholdToDeleteWellnessImages));

    const filters = { valueType: TempDataValueEnum.WellnessImage, createdAt: { $lt: date24HoursAgo } };

    const tempData = await getTempDataByFilter(transactionId, filters, {});

    const totalDeleted = (
      await Promise.all(
        tempData.map(async (tempDatum) => {
          await deleteTempData(transactionId, tempDatum.primaryIdentifier, tempDatum.valueType);
          await deleteFileFromS3(
            transactionId,
            tempDatum.primaryIdentifier,
            true,
            tempDatum.payload.versionId as string,
          );
          logInfo(
            `[${transactionId}] [SERVICE] [removeWellnessImages] image name: ${tempDatum.primaryIdentifier} deleted from temp table and s3.`,
          );
        }),
      )
    ).length;

    logInfo(
      `[${transactionId}] [SERVICE] [removeWellnessImages] successfully deleted: ${totalDeleted} from temp table and s3`,
    );

    return totalDeleted;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] [removeWellnessImages] Failed, reason: ${err.message}`);
    throw err;
  }
};

export {
  getClientDetailByClientPsIds,
  getClientDetailByClientAndTenantIds,
  getClientAdditionalEntitiesByClientAndTenantIds,
  storeClientWellnessImageInS3,
  removeWellnessImages,
};
