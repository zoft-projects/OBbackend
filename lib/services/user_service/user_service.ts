import axios, { AxiosResponse } from 'axios';
import config from 'config';
import { FilterQuery, QueryOptions } from 'mongoose';
import ms from 'ms';
import { featureProvisioningService, mailService } from '..';
import {
  ActiveStateEnum,
  AssetEnum,
  TempDataValueEnum,
  MultipartUploadPhaseEnum,
  MultiMediaEnum,
  S3FoldersEnum,
  ReadFileTypeEnum,
  FileGuidelinesEnum,
  ActiveEnum,
  FeatureEnum,
  UserStatusEnum,
  BranchFeaturesProvisionEnum,
} from '../../enums';
import { logInfo, logWarn, logError } from '../../log/util';
import { OBUserModel } from '../../models';
import {
  OBUserSchemaType,
  OBProfileUpsertOperationType,
  EmployeeServicePayloadType,
  EmployeeInPsUpsertOperationType,
  FileUploadToS3Type,
  FileUploadResponseType,
  FileDeleteResponseType,
  ProcuraEmployeePayloadType,
  EmployeeServiceUpsertOperationType,
  TempDataUpsertOperationType,
  MultipartFileCreateToS3Type,
  MultipartCreateFileUploadResponseType,
  MultipartFileCompleteToS3Type,
  OBUserAlertsSchemaType,
  MultipartFileAbortToS3Type,
  FileStatusResponseType,
  FileGuidelinesResponseType,
  ServiceConfigType,
  OBUserPreferencesSchemaType,
  MailUserConsumerType,
} from '../../types';
import {
  userPsId,
  mapProfileRequestToDBRecord,
  addDays,
  differenceInDays,
  isValidDate,
  retrieveFromPrimaryId,
  getTestUserProcuraDetails,
  mapAccessLevelToName,
  validateFileType,
} from '../../utils';
import { getSecret } from '../../vendors';
import * as cacheService from '../cache_service/cache_service';
import * as jobService from '../job_service/job_service';
import * as multiMediaService from '../multimedia_service/multimedia_service';
import * as onboardUserService from '../onboard_user_service/onboard_user_service';
import * as tempDataService from '../temp_data_service/temp_data_service';

const employeeServiceConfig: {
  endpoint: string;
  apiKeyHeader: string;
  secretKeyName: string;
} = config.get('Services.employeeService');

const bosServiceConfig: ServiceConfigType = config.get('Services.bosService');

const passwordConfig: { passwordValidityInDays: number; passwordWarnIfExpiresWithinDays: number } =
  config.get('Features.profile');

const mailboxFeatureConfig: { maxBatchUserSize: number; mailDomainForFieldStaff: string } =
  config.get('Features.mailbox');

const createObUser = async (transactionId: string, userProfile: OBProfileUpsertOperationType): Promise<string> => {
  try {
    const translatedProfile = mapProfileRequestToDBRecord(userProfile);

    const { job } = translatedProfile;

    if (
      !translatedProfile.employeePsId ||
      !translatedProfile.workEmail ||
      !translatedProfile.job?.code ||
      !translatedProfile.branchAccess ||
      !translatedProfile.activeStatus
    ) {
      throw new Error(`Missing mandatory field for ${translatedProfile.employeePsId}`);
    }

    logInfo(
      `[${transactionId}] [SERVICE] createObUser - create record initiated for psId: ${translatedProfile.employeePsId}`,
    );

    const newObUser = new OBUserModel(translatedProfile);

    // Storing the record
    const createdUser = await newObUser.save();

    const { employeePsId: createdEmployeePsId } = createdUser.toJSON();

    logInfo(
      `[${transactionId}] [SERVICE] createObUser - create record SUCCESSFUL for psId: ${translatedProfile.employeePsId}`,
    );

    await jobService
      .createOrUpdateJob(transactionId, {
        jobId: job.jobId,
        jobCode: job.code,
        jobLevel: job.level,
        jobTitle: job.title,
        jobStatus: ActiveStateEnum.Active,
      })
      .then((createdJobId) => {
        logInfo(
          `[${transactionId}] [SERVICE] createObUser - piggyback job creation SUCCESSFUL for psId: ${translatedProfile.employeePsId}, jobId: ${createdJobId}`,
        );
      })
      .catch((unhandledJobCreateErr) => {
        logInfo(
          `[${transactionId}] [SERVICE] createObUser - piggyback job creation FAILED for psId: ${translatedProfile.employeePsId}, jobId: ${job.jobId}, reason: ${unhandledJobCreateErr.message}`,
        );
      });

    return createdEmployeePsId;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createObUser - ERROR creating psId ${userProfile.psId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const createTempImageRecord = async (
  transactionId: string,
  {
    branchIds,
    userPsId,
    userName,
    file,
    email,
    phone,
    alternateEmail,
  }: {
    userName: string;
    branchIds: string[];
    userPsId: string;
    file: {
      contentType: string;
      content: string;
    };
    email: string;
    phone: string;
    alternateEmail: string;
  },
): Promise<FileUploadResponseType> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] imageModeration - Creating a temp data for image moderation`);

    if (!validateFileType(file?.contentType)) {
      throw new Error(`Invalid file type ${file?.contentType}`);
    }

    const replaceText = /^data:image\/\w+;base64,/;
    const fileContent = Buffer.from(file.content.replace(replaceText, ''), 'base64');

    const uploadedData = await multiMediaService.storeFileS3(
      transactionId,
      {
        buffer: fileContent,
        encoding: '',
        fieldName: '',
        mimetype: '',
        originalName: `${userPsId}.${file.contentType}`,
        size: 0,
      },
      MultiMediaEnum.Image,
      S3FoldersEnum.ProfileImage,
    );

    const imageModerationTempObj: TempDataUpsertOperationType = {
      primaryIdentifier: userPsId,
      valueType: TempDataValueEnum.ImageModeration,
      payload: {
        newProfileImage: uploadedData.fileName,
        userPsId,
        userName,
        title: `Profile info edited by ${userName}`,
        branchIds,
        contentType: file.contentType,
        email,
        phone,
        alternateEmail,
      },
      valueStatus: ActiveStateEnum.Pending,
    };

    await tempDataService.addTempData(transactionId, imageModerationTempObj, {
      shouldOverride: true,
    });

    const signedUrl = await multiMediaService.readFileFromS3(transactionId, {
      key: uploadedData.fileName,
      readType: ReadFileTypeEnum.PresignedUrl,
    });

    logInfo(`[${transactionId}] [SERVICE] imageModeration - Creation of temp data for image moderation is successful`);

    return {
      success: true,
      data: {
        fileName: uploadedData.fileName,
        url: signedUrl as string,
      },
    };
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] imageModeration FAILED, reason: ${createErr.message}`);
    throw createErr;
  }
};

// Updates the user in the employee microservice
const updateEmployeeInPSUser = async (
  transactionId: string,
  updatedFieldsEmployeeInPs: Partial<EmployeeInPsUpsertOperationType>,
): Promise<string> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] updateUserFromEmployeeService - Updating user in employee microservice`);

    if (!updatedFieldsEmployeeInPs.psId) {
      throw new Error('Cannot update employee profile without employee id');
    }

    const apiKey = await getSecret(employeeServiceConfig.secretKeyName);
    const response = await axios.put(
      `${employeeServiceConfig.endpoint}/api/v1/employee_ps/${updatedFieldsEmployeeInPs.psId}`,
      { employeePsId: updatedFieldsEmployeeInPs.psId, ...updatedFieldsEmployeeInPs },
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    if (!response.data?.success) {
      throw new Error(response.data?.message ?? 'Update failed calling the employee service');
    }

    await cacheService.remove(transactionId, {
      serviceName: 'employeeService',
      identifier: updatedFieldsEmployeeInPs.psId,
    });

    logInfo(
      `[${transactionId}] [SERVICE] updateUserFromEmployeeService SUCCESSFUL with response status: ${
        response.status
      } and response:${JSON.stringify(response.data)}`,
    );

    return response.data.data.psId;
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] updateUserFromEmployeeService FAILED, reason: ${fetchErr.message}`);

    throw fetchErr;
  }
};

// Updates the user within the onebayshore ecosystem
const updateObUser = async (
  transactionId: string,
  userProfile: Partial<OBProfileUpsertOperationType>,
): Promise<string> => {
  try {
    if (!userProfile.psId) {
      throw new Error('Missing required fields');
    }

    const prevProfile = await getObUsersByPsId(transactionId, userProfile.psId);

    const { employeePsId, ...updateFields } = mapProfileRequestToDBRecord(userProfile, prevProfile);

    if (Object.keys(updateFields).length === 0) {
      logInfo(`[${transactionId}] [SERVICE] updateObUser - update record SKIPPED for psId: ${employeePsId}`);

      return Promise.resolve(`${employeePsId}_skipped`);
    }

    updateFields.updatedAt = new Date();

    logInfo(
      `[${transactionId}] [SERVICE] updateObUser - update record initiated for psId: ${employeePsId}, updates: ${JSON.stringify(
        updateFields,
      )}`,
    );

    const updatedUser = await OBUserModel.findOneAndUpdate(
      {
        employeePsId,
      },
      updateFields,
    );

    const { employeePsId: updatedEmployeePsId } = updatedUser.toJSON();

    logInfo(`[${transactionId}] [SERVICE] updateObUser - update record SUCCESSFUL for psId: ${employeePsId}`);

    if (updateFields.job) {
      await jobService
        .createOrUpdateJob(transactionId, {
          jobId: updateFields.job.jobId,
          jobCode: updateFields.job.code,
          jobLevel: updateFields.job.level,
          jobTitle: updateFields.job.title,
          jobStatus: ActiveStateEnum.Active,
        })
        .then((createdJobId) => {
          logInfo(
            `[${transactionId}] [SERVICE] updateObUser - piggyback job creation SUCCESSFUL for psId: ${userProfile.psId}, jobId: ${createdJobId}`,
          );
        })
        .catch((unhandledJobCreateErr) => {
          logInfo(
            `[${transactionId}] [SERVICE] updateObUser - piggyback job creation FAILED for psId: ${userProfile.psId}, jobId: ${updateFields.job.jobId}, reason: ${unhandledJobCreateErr.message}`,
          );
        });
    }

    await cacheService.remove(transactionId, {
      serviceName: 'userService',
      identifier: employeePsId,
    });

    return updatedEmployeePsId;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updateObUser - ERROR updating psId ${userProfile.psId}, reason: ${updateErr.message}`,
    );

    throw updateErr;
  }
};

// function calling both ob service and employee user service depending on the fields that were updated
const updateUserByPsId = async (
  transactionId: string,
  userProfile: Partial<OBProfileUpsertOperationType & EmployeeInPsUpsertOperationType>,
): Promise<string> => {
  const fieldsOfEmployeeInPs = Object.keys(userProfile) as Array<
    keyof Partial<OBProfileUpsertOperationType & EmployeeInPsUpsertOperationType>
  >;

  if (!userProfile.psId) {
    throw new Error('Cannot update profile without a valid ps id');
  }

  // WARNING: This list will need to be updated if new fields are expected for the service update
  const employeePIIFieldNames = [
    'bioInSystem',
    'gender',
    'languageProficiencies',
    'specialEducationDesc',
    'skillsAndCertifications',
    'immunizations',
    'currentAddress',
    'modeOfTransport',
    'personalPreferences',
    'profileImage',
    'consents',
    'topAlerts',
  ] as Array<keyof EmployeeInPsUpsertOperationType>;

  // WARNING: This list will need to be updated if new fields are expected for the onebayshore user profile update
  const employeeAccessFieldNames = [
    'displayName',
    'workEmail',
    'overriddenAccessJobId',
    'overriddenAccessJobLevel',
    'activeStatus',
    'isActivated',
    'branchIds',
    'overriddenBranchIds',
    'job',
    'legacyIds',
    'deviceTokens',
    'vendors',
    'prerequisites',
    'tempProfile',
    'preferences',
    'provincialCodes',
    'firstLoggedAt',
    'lastLoggedAt',
    'lastVisitedAt',
    'activatedAt',
    'badge',
    'lastVisit',
    'hireDate',
  ] as Array<keyof OBProfileUpsertOperationType>;

  const hasUpdatesForPII = fieldsOfEmployeeInPs.some((objectKey) =>
    employeePIIFieldNames.includes(objectKey as keyof EmployeeInPsUpsertOperationType),
  );
  const hasEmployeeAccessDetails = fieldsOfEmployeeInPs.some((objectKey) =>
    employeeAccessFieldNames.includes(objectKey as keyof OBProfileUpsertOperationType),
  );

  if (!hasEmployeeAccessDetails && !hasUpdatesForPII) {
    throw new Error('Fields missing for updating any user information');
  }

  let successfulPsId: string;

  if (hasUpdatesForPII) {
    logInfo(
      `[${transactionId}] [SERVICE] updateUser - Identified updates for PII information, calling Employee Microservice for psId: ${userProfile.psId}`,
    );

    const updatedFieldsEmployeeInPs: Partial<EmployeeInPsUpsertOperationType> = {};
    fieldsOfEmployeeInPs.forEach((field) => (updatedFieldsEmployeeInPs[field] = userProfile[field]));

    logInfo(
      `[${transactionId}] [SERVICE] updateUser - Update Employee Microservice initiated for psId: ${
        userProfile.psId
      }, details: ${JSON.stringify(updatedFieldsEmployeeInPs)}`,
    );

    successfulPsId = await updateEmployeeInPSUser(transactionId, updatedFieldsEmployeeInPs);

    logInfo(
      `[${transactionId}] [SERVICE] updateUser - Updated Employee Microservice SUCCESSFULLY for psId: ${successfulPsId}`,
    );
  }

  if (hasEmployeeAccessDetails) {
    const updatedFieldsEmployeeInPs: Partial<OBProfileUpsertOperationType> = {};

    fieldsOfEmployeeInPs.forEach((field) => (updatedFieldsEmployeeInPs[field] = userProfile[field]));

    logInfo(
      `[${transactionId}] [SERVICE] updateUser - Update OB user initiated for psId: ${
        userProfile.psId
      }, details: ${JSON.stringify(updatedFieldsEmployeeInPs)}`,
    );

    successfulPsId = await updateObUser(transactionId, userProfile);

    logInfo(`[${transactionId}] [SERVICE] updateUser - Updated OB User SUCCESSFULLY for psId: ${successfulPsId}`);
  }

  await cacheService.remove(transactionId, {
    serviceName: 'userService',
    identifier: successfulPsId,
  });

  return successfulPsId;
};

const getObUsersByPsIds = async (
  transactionId: string,
  psIds: string[],
  { activeOnly } = { activeOnly: false },
): Promise<OBUserSchemaType[]> => {
  const matchingUsers: OBUserSchemaType[] = [];

  logInfo(
    `[${transactionId}] [SERVICE] getObUsersByPsIds - find previous entries, requested: ${JSON.stringify(psIds)}`,
  );

  const filters: FilterQuery<OBUserSchemaType> = {};

  if (activeOnly) {
    filters.activeStatus = UserStatusEnum.Active;
  }

  if (psIds.length > 500) {
    logWarn(
      `[${transactionId}] [SERVICE] getObUsersByPsIds - WARNING requested psIds are more than 500, consider batching the request`,
    );
  }

  try {
    const obUsersCursor = OBUserModel.find({
      employeePsId: {
        $in: psIds,
      },
      ...filters,
    })
      .lean()
      .cursor();

    for await (const obUserRecord of obUsersCursor) {
      matchingUsers.push(obUserRecord);
    }
  } catch (readError) {
    logError(
      `[${transactionId}] [SERVICE] getObUsersByPsIds - ERROR reading previous collections, reason: ${readError.message}`,
    );

    throw new Error('Unable to read to previous entries');
  }

  return matchingUsers;
};

const getObUsersByFilter = async (
  transactionId: string,
  filters?: FilterQuery<OBUserSchemaType>,
  options?: {
    limit: number;
    skip: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  },
): Promise<OBUserSchemaType[]> => {
  // TODO: remove id from filters.
  if (filters?.id) {
    filters._id = filters.id;
  }

  logInfo(
    `[${transactionId}] [SERVICE] getObUsersByFilter - find all users by filters: ${
      filters ? JSON.stringify(filters) : 'None'
    }`,
  );

  const searchQuery: FilterQuery<OBUserSchemaType> = {};
  if (options && options.search) {
    const searchKeyWord = retrieveFromPrimaryId(options.search);

    const searchRegex = new RegExp(searchKeyWord, 'i');

    searchQuery.$or = [
      { employeePsId: searchRegex },
      { workEmail: searchRegex },
      { displayName: searchRegex },
      { 'legacySystems.legacySystemId': searchRegex },
    ];
  }

  const sortQuery: QueryOptions<OBUserSchemaType> = {};
  if (options && options.sortField) {
    sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
  } else {
    sortQuery.createdAt = -1; // Default sort by createdAt in descending order
  }

  const userQueryCursor = OBUserModel.find({
    ...filters,
    ...searchQuery,
  })
    .sort(sortQuery)
    .skip(options?.skip ?? 0)
    .limit(options?.limit ?? 100)
    .cursor();

  const obUsers: OBUserSchemaType[] = [];

  for await (const obUser of userQueryCursor) {
    obUsers.push(obUser.toJSON());
  }

  logInfo(
    `[${transactionId}] [SERVICE] getObUsersByFilter - total users retrieved filters: ${
      filters ? JSON.stringify(filters) : 'None'
    } and count: ${obUsers.length}`,
  );

  return obUsers;
};

const getObUsersByFilterV2 = async (
  transactionId: string,
  filters?: FilterQuery<OBUserSchemaType>,
  options?: {
    limit: number;
    skip: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  },
): Promise<OBUserSchemaType[]> => {
  // Remove id from filters if present
  if (filters?.id) {
    filters._id = filters.id;
    delete filters.id;
  }

  logInfo(
    `[${transactionId}] [SERVICE] getObUsersByFilter - find all users by filters: ${
      filters ? JSON.stringify(filters) : 'None'
    }`,
  );

  const searchQuery: FilterQuery<OBUserSchemaType> = {};
  if (options?.search) {
    const searchKeyWord = retrieveFromPrimaryId(options.search);
    const searchRegex = new RegExp(searchKeyWord, 'i');

    searchQuery.$or = [
      { employeePsId: searchRegex },
      { workEmail: searchRegex },
      { displayName: searchRegex },
      { 'legacySystems.legacySystemId': searchRegex },
    ];
  }

  const sortQuery: QueryOptions<OBUserSchemaType> = {
    [options?.sortField ?? 'createdAt']: options?.sortOrder === 'asc' ? 1 : -1,
  };

  // Use `.lean()` to return plain JS objects (faster than `.toJSON()`)
  const obUsers: OBUserSchemaType[] = await OBUserModel.find({
    ...filters,
    ...searchQuery, // Only include searchQuery if search is provided
  })
    .sort(sortQuery)
    .skip(options?.skip ?? 0)
    .limit(options?.limit ?? 100)
    .lean() // Boost performance
    .exec(); // Faster than `.cursor()`

  logInfo(
    `[${transactionId}] [SERVICE] getObUsersByFilter - total users retrieved filters: ${
      filters ? JSON.stringify(filters) : 'None'
    } and count: ${obUsers.length}`,
  );

  return obUsers;
};

async function getObUsersByBranchIds(
  transactionId: string,
  branchIds: string[],
  jobLevels: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9],
  {
    limit = 100,
    skip = 0,
    search,
    activeOnly = false,
    lastCursorId,
    sortField = 'createdAt',
    sortOrder = 'desc',
  }: {
    limit?: number;
    skip?: number;
    search?: string;
    activeOnly?: boolean;
    lastCursorId?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  } = {},
): Promise<OBUserSchemaType[]> {
  let cacheKey = 'multiUsers';
  let force = false;

  const filters: FilterQuery<OBUserSchemaType> = {
    $and: [
      {
        $or: [
          { 'branchAccess.overriddenBranchIds': { $in: branchIds } },
          {
            $and: [
              {
                $or: [
                  { 'branchAccess.overriddenBranchIds': { $exists: false } },
                  { 'branchAccess.overriddenBranchIds': { $size: 0 } },
                ],
              },
              { 'branchAccess.selectedBranchIds': { $in: branchIds } },
            ],
          },
        ],
      },
      { 'obAccess.level': { $in: jobLevels } },
    ],
  };

  cacheKey += `_br_${branchIds.join('_')}`;
  cacheKey += `_job_${jobLevels.join('_')}`;

  if (branchIds.length > 10) {
    force = true;
  }

  if (search) {
    filters.$and.push({
      $or: [{ displayName: { $regex: search, $options: 'i' } }, { workEmail: { $regex: search, $options: 'i' } }],
    });

    cacheKey += `_search_${search}`;
  }

  if (lastCursorId) {
    filters.employeePsId = { $lt: lastCursorId };

    cacheKey += `_cur_${lastCursorId}`;
  }

  if (activeOnly) {
    filters.activeStatus = UserStatusEnum.Active;

    cacheKey += '_stat_active';
  }

  const sortQuery: QueryOptions<OBUserSchemaType> = { [sortField]: sortOrder === 'asc' ? 1 : -1 };

  cacheKey += `_sort_${sortField}_${sortOrder}`;

  logInfo(`[${transactionId}] [SERVICE] Fetching users with filters: ${JSON.stringify(filters)}`);

  if (!force) {
    const cachedList = (await cacheService.retrieve(transactionId, {
      serviceName: 'userService',
      identifier: cacheKey,
    })) as OBUserSchemaType[] | null;

    if (cachedList) {
      logInfo(`[${transactionId}] [SERVICE] Cache key: ${cacheKey}, returning cached list`);

      return cachedList;
    }
  }

  const userQueryCursor = OBUserModel.find(filters).lean().sort(sortQuery).skip(skip).limit(limit).cursor();

  const obUsers: OBUserSchemaType[] = [];
  for await (const obUser of userQueryCursor) {
    obUsers.push(obUser);
  }

  logInfo(`[${transactionId}] [SERVICE] Total users retrieved: ${obUsers.length}`);

  await cacheService.persist(transactionId, {
    serviceName: 'userService',
    identifier: cacheKey,
    data: obUsers,
    expires: '1m',
  });

  return obUsers;
}

const createOrUpdateMultipleObUsers = async (
  transactionId: string,
  userProfiles: Partial<OBProfileUpsertOperationType>[],
): Promise<{ successfulPsIds: string[]; failedPsIds: string[] }> => {
  logInfo(`[${transactionId}] [Service] [createOrUpdateMultipleObUsers] Initiated`);

  const userPsIds = userProfiles.map(({ psId }) => userPsId(psId));
  const prevUserMap = new Map<string, boolean>();

  try {
    if (userPsIds.length === 0) {
      throw new Error('No psIds available to do the create/update operation for users');
    }

    const prevUsers = await getObUsersByPsIds(transactionId, userPsIds);

    prevUsers.forEach(({ employeePsId }) => {
      prevUserMap.set(employeePsId, true);
    });
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] createOrUpdateMultipleObUsers - unable to search prev users`);

    throw fetchErr;
  }

  const createProfileCandidateMap = new Map<string, OBProfileUpsertOperationType>();
  const updateProfileCandidateMap = new Map<string, Partial<OBProfileUpsertOperationType>>();

  for (const profile of userProfiles) {
    // Need a better validation like validateProfileInput(profile)
    if (!profile.psId) {
      logWarn(`[${transactionId}] [SERVICE] createOrUpdateMultipleObUsers - WARNING validation error`);
      continue;
    }

    if (prevUserMap.has(profile.psId)) {
      // Need to add translation
      updateProfileCandidateMap.set(profile.psId, profile);
      continue;
    }

    const prerequisites = await onboardUserService.getPrerequisiteCriterias(transactionId, {
      employeePsId: profile.psId,
      branchIds: profile.branchIds,
      jobLevel: profile.job.level,
      divisionIds: [],
    });

    profile.prerequisites = prerequisites.map((prerequisite) => ({
      preReqId: prerequisite.preRequisiteId,
      title: prerequisite.title,
      status: prerequisite.status,
    }));

    // Need to add translation
    createProfileCandidateMap.set(profile.psId, profile as OBProfileUpsertOperationType);
  }

  if (createProfileCandidateMap.size === 0) {
    logWarn(`[${transactionId}] [SERVICE] createOrUpdateMultipleObUsers - WARNING No new profiles to add`);
  }

  const createProfileCandidates = [...createProfileCandidateMap.values()];
  const updateProfileCandidates = [...updateProfileCandidateMap.values()];

  const results = await Promise.allSettled([
    ...createProfileCandidates.map((profileCandidate) => createObUser(transactionId, profileCandidate)),
    ...updateProfileCandidates.map((profileCandidate) => updateObUser(transactionId, profileCandidate)),
  ]);

  const stats = {
    successful: new Set<string>(),
    failed: new Set<string>(),
  };

  results.forEach((detail) => {
    if (detail.status === 'rejected') {
      logError(
        `[${transactionId}] [SERVICE] createOrUpdateMultipleObUsers - ERROR on mutation, reason: ${detail.reason}`,
      );

      return;
    }
    stats.successful.add(detail.value);
  });

  userPsIds.forEach((requestedPsId) => {
    if (!stats.successful.has(requestedPsId)) {
      stats.failed.add(requestedPsId);
    }
  });

  return {
    successfulPsIds: [...stats.successful],
    failedPsIds: [...stats.failed],
  };
};

const getEmployeePSFromEmployeeService = async (
  transactionId: string,
  employeePsId: string,
): Promise<EmployeeServicePayloadType | null> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] getEmployeePSFromEmployeeService - Fetching user ${employeePsId} from employee microservice`,
    );

    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);

    const cachedEmployeeData = (await cacheService.retrieve(transactionId, {
      serviceName: 'employeeService',
      identifier: employeePsId,
    })) as EmployeeServicePayloadType | null;

    if (cachedEmployeeData) {
      logInfo(`[${transactionId}] [SERVICE] getEmployeePSFromEmployeeService SUCCESSFUL, using cached data`);

      return cachedEmployeeData;
    }

    const response = await axios.get<EmployeeServicePayloadType>(
      `${employeeServiceConfig.endpoint}/api/v1/employee_ps/${employeePsId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    if (!response.data) {
      throw new Error('Employee not found');
    }

    await cacheService.persist(transactionId, {
      serviceName: 'employeeService',
      identifier: employeePsId,
      data: response.data,
      expires: '1d',
    });

    logInfo(`[${transactionId}] [SERVICE] getEmployeePSFromEmployeeService SUCCESSFUL`);

    return response.data;
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] getEmployeePSFromEmployeeService FAILED, reason: ${fetchErr.message}`);

    return null;
  }
};

const createMultipleUsersInEmployeeService = async (
  transactionId: string,
  employeeData: EmployeeServiceUpsertOperationType[],
): Promise<{ successfulPsIds: string[]; failedPsIds: string[] }> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] createMultipleUsersInEmployeeService - Creating user in employee microservice`,
    );

    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);

    const response = await axios.post(`${employeeServiceConfig.endpoint}/api/v1/employee_ps/`, employeeData, {
      headers: {
        'Content-Type': 'application/json',
        [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        timeout: ms('15s'),
      },
    });

    const { successful: successfulPsIds, failed: failedPsIds } = response.data;

    logInfo(`[${transactionId}] [SERVICE] createMultipleUsersInEmployeeService SUCCESSFUL`);

    return {
      successfulPsIds,
      failedPsIds,
    };
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] createMultipleUsersInEmployeeService FAILED, reason: ${createErr.message}`);

    return null;
  }
};

const updateEmployeeInEmployeeService = async (
  transactionId: string,
  employeePsId: string,
  employeeData: EmployeeServiceUpsertOperationType,
): Promise<string> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] updateEmployeeInEmployeeService - Updating user ${employeePsId} in employee microservice`,
    );

    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);

    const response = await axios.put(
      `${employeeServiceConfig.endpoint}/api/v1/employee_ps/${employeePsId}`,
      employeeData,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
          timeout: ms('15s'),
        },
      },
    );

    const {
      success,
      data,
      message,
    }: {
      success: boolean;
      message?: string;
      data?: {
        psId: string;
      };
    } = response.data;

    if (!success) {
      throw new Error(message);
    }

    logInfo(`[${transactionId}] [SERVICE] updateEmployeeInEmployeeService SUCCESSFUL for ${employeePsId}`);

    await cacheService.remove(transactionId, {
      serviceName: 'employeeService',
      identifier: employeePsId,
    });

    return data.psId;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updateEmployeeInEmployeeService FAILED for ${employeePsId}, reason: ${updateErr.message}`,
    );

    throw updateErr;
  }
};

const getMultipleProcuraDetailFromEmployeeService = async (
  transactionId: string,
  employeePsId: string,
): Promise<ProcuraEmployeePayloadType[]> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] getProcuraDetailFromEmployeeService - Fetching user from employee microservice`,
    );

    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);

    const cachedEmployeeData = (await cacheService.retrieve(transactionId, {
      serviceName: 'procuraEmployeeService',
      identifier: employeePsId,
    })) as ProcuraEmployeePayloadType[];

    if (cachedEmployeeData) {
      logInfo(`[${transactionId}] [SERVICE] getProcuraDetailFromEmployeeService SUCCESSFUL, using cached data`);

      return cachedEmployeeData;
    }

    // Below is post but technically should be get request
    const response: AxiosResponse<ProcuraEmployeePayloadType[]> = await axios.get(
      `${employeeServiceConfig.endpoint}/api/v1/employee/${employeePsId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    if (!response.data) {
      throw new Error('Employee not found');
    }

    // In procura, employees can exist in multiple tenants but can be active in only 1 tenant at a time
    const validEmployeeList = response.data.filter(({ statusInBranch }) => {
      if (!Array.isArray(statusInBranch) || statusInBranch.length === 0) {
        return false;
      }

      return true;
    });

    await cacheService.persist(transactionId, {
      serviceName: 'procuraEmployeeService',
      identifier: employeePsId,
      data: validEmployeeList,
      expires: '2h',
    });

    logInfo(`[${transactionId}] [SERVICE] getProcuraDetailFromEmployeeService SUCCESSFUL`);

    return validEmployeeList;
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] getProcuraDetailFromEmployeeService FAILED, reason: ${fetchErr.message}`);

    return getTestUserProcuraDetails(employeePsId);
  }
};

const removeUserFromSystem = async (transactionId: string, removeEmployeePsId: string): Promise<string> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] removeUserFromSystem - Removing employee ${removeEmployeePsId}`);

    if (!removeEmployeePsId) {
      throw new Error('Provide a valid employee psId to remove');
    }

    const [{ deletedCount }] = await Promise.all([
      OBUserModel.deleteOne({
        employeePsId: removeEmployeePsId,
      }),
      cacheService.remove(transactionId, {
        serviceName: 'userService',
        identifier: removeEmployeePsId,
      }),
    ]);

    logInfo(
      `[${transactionId}] [SERVICE] removeUserFromSystem - Removing employee SUCCESSFUL for psId: ${removeEmployeePsId}, deletedCount: ${deletedCount}`,
    );

    return removeEmployeePsId;
  } catch (removeErr) {
    logError(
      `[${transactionId}] [SERVICE] removeUserFromSystem - Removing employee FAILED, reason: ${removeErr.message}`,
    );

    throw removeErr;
  }
};

const getObUsersByPsId = async (transactionId: string, psId: string): Promise<OBUserSchemaType> => {
  const cachedObUser = (await cacheService.retrieve(transactionId, {
    serviceName: 'userService',
    identifier: psId,
  })) as OBUserSchemaType | null;

  if (cachedObUser) {
    return cachedObUser;
  }

  const [matchingUser] = await getObUsersByPsIds(transactionId, [psId]);

  if (matchingUser) {
    cacheService.persist(transactionId, {
      serviceName: 'userService',
      identifier: psId,
      data: matchingUser,
      expires: '1h',
    });
  }

  return matchingUser;
};

const uploadFileToEmployeeService = async (
  transactionId: string,
  psId: string,
  fileToUpload: FileUploadToS3Type,
): Promise<FileUploadResponseType> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] uploadFileToEmployeeService - upload file initiated for psId: ${psId}`);
    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);
    const response = await axios.post(
      `${employeeServiceConfig.endpoint}/api/v1/employee_ps/${psId}/file`,
      { ...fileToUpload, employeePsId: psId },
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    logInfo(`[${transactionId}] [SERVICE] uploadFileToEmployeeService - upload file SUCCESSFUL for psId: ${psId}`);

    await cacheService.remove(transactionId, {
      serviceName: 'employeeService',
      identifier: psId,
    });

    return response.data;
  } catch (err) {
    logError(
      `[${transactionId}] [SERVICE] uploadFileToEmployeeService - ERROR uploading file to psId: ${psId}, reason: ${err.message}`,
    );

    throw err;
  }
};

const uploadFileByPsId = async (
  transactionId: string,
  psId: string,
  fileToUpload: FileUploadToS3Type,
  additionDetails: {
    branchIds: string[];
    displayName: string;
    email: string;
    phone: string;
    alternateEmail: string;
  },
): Promise<FileUploadResponseType> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] uploadFile - upload file initiated for psId: ${psId}`);

    if (fileToUpload.type === AssetEnum.ProfileImage) {
      // moderation logic here

      const uploadedFileResponse = await createTempImageRecord(transactionId, {
        branchIds: additionDetails.branchIds,
        userName: additionDetails.displayName,
        userPsId: psId,
        file: {
          content: fileToUpload.content,
          contentType: fileToUpload.fileType,
        },
        email: additionDetails.email,
        phone: additionDetails.phone,
        alternateEmail: additionDetails.alternateEmail,
      });

      return uploadedFileResponse;
    }

    // calling employee service directly as we are not doing moderation for some assets
    const uploadedFile = await uploadFileToEmployeeService(transactionId, psId, fileToUpload);

    logInfo(`[${transactionId}] [SERVICE] uploadFile - upload file SUCCESSFUL for psId: ${psId}`);

    return uploadedFile;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] uploadFile - ERROR uploading file to psId: ${psId}, reason: ${err.message}`);

    throw err;
  }
};

const uploadMultiPartFileByPsId = async (
  transactionId: string,
  psId: string,
  fileToUpload: MultipartFileCreateToS3Type | MultipartFileCompleteToS3Type | MultipartFileAbortToS3Type,
  phase: MultipartUploadPhaseEnum,
): Promise<MultipartCreateFileUploadResponseType | FileUploadResponseType> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] uploadMultiPartFileByPsId - upload multipart file initiated for psId: ${psId}`,
    );

    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);
    const response = await axios.post(
      `${employeeServiceConfig.endpoint}/api/v1/employee_ps/${psId}/file?multipart=true&phase=${phase}`,
      { ...fileToUpload, employeePsId: psId },
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    logInfo(`[${transactionId}] [SERVICE] uploadMultiPartFileByPsId - upload file  SUCCESSFUL for psId: ${psId}`);

    await cacheService.remove(transactionId, {
      serviceName: 'employeeService',
      identifier: psId,
    });

    return response.data;
  } catch (err) {
    logError(
      `[${transactionId}] [SERVICE] uploadMultiPartFileByPsId - ERROR uploading file to psId: ${psId}, reason: ${err.message}`,
    );

    throw err;
  }
};

const removeFileByPsId = async (
  transactionId: string,
  psId: string,
  { fileName, fileType }: { fileName: string; fileType: AssetEnum },
): Promise<FileDeleteResponseType> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] removeFile - remove file: ${fileName} initiated for user: ${psId}`);

    if (fileType === AssetEnum.ProfileImage) {
      await tempDataService.deleteTempData(transactionId, psId, TempDataValueEnum.ImageModeration);
    }

    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);
    const response = await axios.delete(
      `${employeeServiceConfig.endpoint}/api/v1/employee_ps/${psId}/file?fileName=${fileName}&fileType=${fileType}`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    logInfo(`[${transactionId}] [SERVICE] removeFile - remove file: ${fileName} SUCCESSFUL for psId: ${psId}`);

    await cacheService.remove(transactionId, {
      serviceName: 'employeeService',
      identifier: psId,
    });

    return response.data;
  } catch (err) {
    logError(
      `[${transactionId}] [SERVICE] removeFile - ERROR removing file: ${fileName} to psId: ${psId}, reason: ${err.message}`,
    );

    throw err;
  }
};

const getFileCompressionStatusByPsId = async (transactionId: string, psId: string): Promise<FileStatusResponseType> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getFileCompressionStatusByPsId initiated for user: ${psId}`);

    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);
    const response = await axios.get(
      `${employeeServiceConfig.endpoint}/api/v1/employee_ps/${psId}/compression_status`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    logInfo(`[${transactionId}] [SERVICE] getFileCompressionStatusByPsId SUCCESSFUL for psId: ${psId}`);

    return response.data.data;
  } catch (err) {
    logError(
      `[${transactionId}] [SERVICE] getFileCompressionStatusByPsId - ERROR while checking compression status for psId: ${psId}, reason: ${err.message}`,
    );

    throw err;
  }
};

const calculatePasswordExpirationDays = (
  transactionId: string,
  employeePsId: string,
  pwdLastSet: string,
): { passwordExpiresInDays: number | null; isPasswordExpiringSoon: boolean } => {
  logInfo(`[${transactionId}] [SERVICE] calculatePasswordExpirationDays - Function call initiated`);

  if (!pwdLastSet || !isValidDate(new Date(pwdLastSet))) {
    return { passwordExpiresInDays: null, isPasswordExpiringSoon: false };
  }

  const passwordLastSetDate = new Date(pwdLastSet);
  const currentDate = new Date();
  const expirationDate = addDays(passwordLastSetDate, passwordConfig.passwordValidityInDays);
  const passwordExpiresInDays = differenceInDays(expirationDate, currentDate);

  const isPasswordExpiringSoon = passwordExpiresInDays <= passwordConfig.passwordWarnIfExpiresWithinDays;

  if (isPasswordExpiringSoon) {
    logInfo(
      `[${transactionId}] [SERVICE] calculatePasswordExpirationDays - Password will expire for psId: ${employeePsId} in ${passwordExpiresInDays} days`,
    );
  }

  return { passwordExpiresInDays, isPasswordExpiringSoon };
};

const addUserAlert = async (
  transactionId: string,
  psId: string,
  alertData: OBUserAlertsSchemaType,
): Promise<string> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] addUserAlert - save alert initiated for psId: ${psId}, alert data: ${JSON.stringify(
        alertData,
      )}`,
    );

    const userData = await getObUsersByPsId(transactionId, psId);

    if (!userData) {
      throw new Error("User doesn't exists in the system!");
    }

    logInfo(
      `[${transactionId}] [SERVICE] addUserAlert - user data retrieved, top alerts of user: ${JSON.stringify(
        userData.topAlerts,
      )}`,
    );

    const alerts: OBUserAlertsSchemaType[] = [
      alertData,
      ...(userData.topAlerts ?? []).filter((existingAlert) => existingAlert.alertId !== alertData.alertId),
    ];

    await updateObUser(transactionId, { psId, topAlerts: alerts });

    logInfo(`[${transactionId}] [SERVICE] addUserAlert - top alerts updated for user SUCCESSFUL`);

    return psId;
  } catch (saveErr) {
    logError(
      `[${transactionId}] [SERVICE] addUserAlert - ERROR saving alerts psId ${psId}, reason: ${saveErr.message}`,
    );

    throw saveErr;
  }
};

const getFileGuidelines = async (
  transactionId: string,
  {
    psId,
    type,
    displayName,
    jobTitle,
  }: { psId: string; type: FileGuidelinesEnum; displayName: string; jobTitle: string },
): Promise<FileGuidelinesResponseType> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getFileGuidelines initiated for user: ${psId} and type:${type}`);
    const [firstName, lastName] = displayName.split(' ');

    const apiKey = await getSecret(bosServiceConfig.secretKeyName);
    const response = await axios.get<FileGuidelinesResponseType>(
      `${bosServiceConfig.baseUri}/api/v1/bos/internal/docs`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${bosServiceConfig.apiKeyHeader}`]: `${apiKey}`,
          'X-Transaction-Id': transactionId,
          Host: bosServiceConfig.host,
        },
        params: {
          type,
          firstName,
          lastName,
          jobTitle,
        },
      },
    );

    logInfo(`[${transactionId}] [SERVICE] getFileGuidelines SUCCESSFUL for psId: ${psId}`);

    return response.data;
  } catch (err) {
    logError(
      `[${transactionId}] [SERVICE] getFileGuidelines - ERROR while getting file guidelines for psId: ${psId}, reason: ${err.message}`,
    );

    throw err;
  }
};

const syncJobLevelForBranchId = async (transactionId: string, branchId: string): Promise<number> => {
  logInfo(`[${transactionId}] [SERVICE] syncJobLevelForBranchId initiated for branchId:${branchId}`);

  const toUpdateUsers: Partial<OBUserSchemaType>[] = [];
  const jobs = await jobService.getAllJobs(transactionId);

  const jobIdLevelMap = new Map<string, number>();

  jobs.forEach((job) => {
    jobIdLevelMap.set(job.jobId, job.jobLevel);
  });

  const canSyncUsers = async (skip = 0, limit = 1000) => {
    const branchUsers = await getObUsersByBranchIds(transactionId, [branchId], undefined, {
      skip,
      limit,
      sortField: 'createdAt',
      sortOrder: 'desc',
    });

    branchUsers.forEach((branchUser) => {
      const expectedLevel = jobIdLevelMap.get(branchUser.job.jobId);

      if (!expectedLevel || (expectedLevel === branchUser.job.level && expectedLevel === branchUser.obAccess.level)) {
        return;
      }

      const expectedAssumedLevel =
        !branchUser.obAccess || branchUser.obAccess.jobId === branchUser.job.jobId
          ? expectedLevel
          : branchUser.obAccess.level;

      toUpdateUsers.push({
        employeePsId: branchUser.employeePsId,
        job: {
          ...branchUser.job,
          level: expectedLevel,
        },
        obAccess: {
          ...(branchUser.obAccess ?? null),
          level: expectedAssumedLevel,
          name: mapAccessLevelToName(expectedAssumedLevel),
        },
      });
    });

    return branchUsers.length < limit;
  };

  for (let iter = 0; iter <= 10; iter += 1) {
    if (!(await canSyncUsers(iter * 1000, 1000))) {
      break;
    }
  }

  logInfo(
    `[${transactionId}] [SERVICE] syncJobLevelForBranchId users with job level discrepancies found: ${JSON.stringify(
      toUpdateUsers,
    )}`,
  );

  for (const toUpdateUser of toUpdateUsers) {
    logInfo(
      `[${transactionId}] [SERVICE] syncJobLevelForBranchId - syncing job level for employeePsId: ${toUpdateUser.employeePsId}, branchId: ${branchId}, new level: ${toUpdateUser.job.level}`,
    );
    await OBUserModel.updateOne(
      {
        employeePsId: toUpdateUser.employeePsId,
      },
      {
        $set: {
          job: {
            ...toUpdateUser.job,
          },
          obAccess: {
            ...toUpdateUser.obAccess,
          },
        },
      },
    );
    await cacheService.remove(transactionId, {
      serviceName: 'userService',
      identifier: toUpdateUser.employeePsId,
    });
  }

  return toUpdateUsers.length;
};

const syncBranchForMailInbox = async (
  transactionId: string,
  branchId: string,
  state: ActiveEnum,
  jobLevel?: number[],
): Promise<void> => {
  logInfo(
    `[${transactionId}] [SERVICE] syncBranchForMailInbox initiated for branchId: ${branchId}, state: ${state}, jobLevel: ${jobLevel}`,
  );
  const levels = jobLevel || [1];

  const toUpdateUsers: Partial<OBUserSchemaType>[] = [];
  const mailUsers: MailUserConsumerType[] = [];

  const isProvisioned = await featureProvisioningService.getProvisionForBranchId(
    transactionId,
    BranchFeaturesProvisionEnum.EmailFeature,
    branchId,
  );
  logInfo(`[${transactionId}] [CONTROLLER] [syncBranchForMailInbox] Email feature status: ${isProvisioned}`);

  if (!isProvisioned) {
    logInfo(`[${transactionId}] [CONTROLLER] [syncBranchForMailInbox] Email feature is not enabled for this branch`);

    return;
  }

  const canSyncUsers = async (skip = 0, limit = 1000) => {
    const branchUsers = await getObUsersByBranchIds(transactionId, [branchId], levels, {
      skip,
      limit,
      sortField: 'createdAt',
      sortOrder: 'desc',
    });

    branchUsers.forEach((branchUser) => {
      let preferences: OBUserPreferencesSchemaType[] = [];

      if (Array.isArray(branchUser.preferences) && branchUser.preferences.length > 0) {
        preferences = branchUser.preferences.filter(({ name, value }) => name && value);
      }

      const mailPreference = {
        name: FeatureEnum.EmailInbox,
        value: state,
      };
      const mailAccessPref = preferences.find((pref) => pref.name === FeatureEnum.EmailInbox);

      if (mailAccessPref) {
        mailAccessPref.value = state;
      } else {
        preferences.push(mailPreference);
      }

      toUpdateUsers.push({
        employeePsId: branchUser.employeePsId,
        preferences,
      });

      const [userId] = branchUser.workEmail.split('@');
      const [firstName, lastName] = branchUser.displayName.split(' ');

      const payload: MailUserConsumerType = {
        employeeId: branchUser.employeePsId,
        firstName,
        lastName,
        // Mailbox address is different from original email
        bayshoreEmailAddress: `${userId}@${mailboxFeatureConfig.mailDomainForFieldStaff}`,
        emailAddress: `${userId}@${mailboxFeatureConfig.mailDomainForFieldStaff}`,
        bayshoreUserId: userId,
        isActive: state === ActiveEnum.Enabled,
        dateCreated: branchUser.createdAt,
        status: branchUser.activeStatus,
        previousUserRecord: true,
      };

      mailUsers.push(payload);

      logInfo(
        `[${transactionId}] [CONTROLLER] [enrollUserInSystem] Sending payload to enrollment service: ${JSON.stringify(
          payload,
        )}`,
      );
    });

    return branchUsers.length < limit;
  };

  for (let iter = 0; iter <= 10; iter += 1) {
    if (!(await canSyncUsers(iter * 1000, 1000))) {
      break;
    }
  }

  logInfo(
    `[${transactionId}] [SERVICE] syncJobLevelForBranchId users with preferences: ${JSON.stringify(toUpdateUsers)}`,
  );

  for (const toUpdateUser of toUpdateUsers) {
    logInfo(
      `[${transactionId}] [SERVICE] syncJobLevelForBranchId - syncing preferences for employeePsId: ${toUpdateUser.employeePsId}, branchId: ${branchId}`,
    );
    await OBUserModel.updateOne(
      {
        employeePsId: toUpdateUser.employeePsId,
      },
      {
        $set: {
          preferences: toUpdateUser.preferences,
        },
      },
    );
  }

  // Notify MS in batches
  const BATCH_SIZE = mailboxFeatureConfig.maxBatchUserSize || 100;

  for (let i = 0; i < mailUsers.length; i += BATCH_SIZE) {
    const batch = mailUsers.slice(i, i + BATCH_SIZE);
    await mailService.sendMailUsersDataToEmployeeService(transactionId, batch);
  }

  return;
};

export {
  getObUsersByPsId,
  getObUsersByPsIds,
  getObUsersByBranchIds,
  getObUsersByFilter,
  getObUsersByFilterV2,
  getEmployeePSFromEmployeeService,
  createMultipleUsersInEmployeeService,
  updateEmployeeInEmployeeService,
  getMultipleProcuraDetailFromEmployeeService,
  updateUserByPsId,
  createOrUpdateMultipleObUsers,
  removeUserFromSystem,
  uploadFileByPsId,
  removeFileByPsId,
  calculatePasswordExpirationDays,
  createTempImageRecord,
  uploadMultiPartFileByPsId,
  uploadFileToEmployeeService,
  addUserAlert,
  getFileCompressionStatusByPsId,
  getFileGuidelines,
  syncJobLevelForBranchId,
  syncBranchForMailInbox,
};
