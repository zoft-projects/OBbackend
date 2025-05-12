import { FilterQuery } from 'mongoose';
import { logInfo, logError, logWarn } from '../../log/util';
import { OBUserLocationModel } from '../../models';
import { OBUserLocationSchemaType, UserLocationModifiedOperationType } from '../../types';
import { encodeGeo, prefixUserLocationId, decodeGeo } from '../../utils';
import { getSecret } from '../../vendors';

const registerLocation = async (
  transactionId: string,
  userLocation: {
    groupId: string;
    userPsId: string;
    latitude: string;
    longitude: string;
    visitId?: string;
    tenantId?: string;
    clientId?: string;
    cvid?: string;
    comment?: string;
    captureType?: string;
    deviceTime: Date;
  },
): Promise<void> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] registerLocation - registering location for userPsId: ${userLocation.userPsId}, groupId: ${userLocation.groupId}`,
    );

    if (
      !userLocation.groupId ||
      !userLocation.userPsId ||
      !userLocation.latitude ||
      !userLocation.longitude ||
      !userLocation.deviceTime
    ) {
      throw new Error('Required fields are missing');
    }

    const keyFactor = (await getSecret('ob_employee_location_factor')) ?? '';

    const encodedGeo = encodeGeo(userLocation.latitude, userLocation.longitude, keyFactor);

    const obUserLocationSchema: OBUserLocationSchemaType = {
      locationId: prefixUserLocationId(),
      groupId: userLocation.groupId,
      employeePsId: userLocation.userPsId,
      encodedGeo,
      deviceTime: userLocation.deviceTime,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (userLocation.visitId) {
      obUserLocationSchema.visitId = userLocation.visitId;
    }

    if (userLocation.tenantId) {
      obUserLocationSchema.tenantId = userLocation.tenantId;
    }

    if (userLocation.clientId) {
      obUserLocationSchema.clientId = userLocation.clientId;
    }

    if (userLocation.cvid) {
      obUserLocationSchema.cvid = userLocation.cvid;
    }
    if (userLocation.comment) {
      obUserLocationSchema.comment = userLocation.comment;
    }
    if (userLocation.captureType) {
      obUserLocationSchema.captureType = userLocation.captureType;
    }

    const newLocation = new OBUserLocationModel(obUserLocationSchema);

    await newLocation.save();

    logInfo(`[${transactionId}] [SERVICE] registerLocation - SUCCESSFUL for locationId: ${newLocation.locationId}`);

    return;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] registerLocation - FAILED, reason: ${err.message}`);

    throw err;
  }
};

const getLocationsByDates = async (
  transactionId: string,
  userPsId: string,
  {
    startDate,
    endDate,
  }: {
    startDate: Date;
    endDate: Date;
  },
): Promise<UserLocationModifiedOperationType[]> => {
  try {
    const filter: FilterQuery<OBUserLocationSchemaType> = {
      employeePsId: userPsId,
      deviceTime: {
        $gte: startDate,
        $lte: endDate,
      },
    };
    const keyFactor = (await getSecret('ob_employee_location_factor')) ?? '';
    const userLocationDbRecords = await OBUserLocationModel.find(filter);

    const filteredLocations: UserLocationModifiedOperationType[] = [];

    for (const userLocation of userLocationDbRecords) {
      const { encodedGeo, ...jsonUserLocation } = userLocation.toJSON();

      const decodedGeo = decodeGeo(encodedGeo, keyFactor);
      if (!decodedGeo) {
        continue;
      }

      const { latitude, longitude } = decodedGeo;

      filteredLocations.push({ ...jsonUserLocation, latitude, longitude });
    }

    logWarn(
      `[${transactionId}] [SERVICE] getLocationsByDates - No location found for user: ${userPsId} in date range ${startDate.toDateString()} : ${endDate.toDateString()}`,
    );

    return filteredLocations;
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] getLocationsByDates - FAILED, reason: ${fetchErr.message}`);

    throw fetchErr;
  }
};

export { registerLocation, getLocationsByDates };
