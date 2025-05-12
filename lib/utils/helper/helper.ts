import Chance from 'chance';
import {
  format,
  addDays,
  addHours,
  addMinutes,
  subHours,
  subMinutes,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  isBefore,
  startOfDay,
  subDays,
  isEqual as isEqualDate,
  isValid as isValidDate,
  isSameDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { deepEqual } from 'fast-equals';
import ms from 'ms';
import generate from 'nanoid/generate';
import { AudienceEnum } from '../../enums';
import {
  AddressType,
  ReadableAddressType,
  ProcuraEmployeePayloadType,
  OBUserAccessSchemaType,
  OBUserJobSchemaType,
} from '../../types';
import { encryptText, decryptText } from '../naming/base_encoding';

const ALPHA_NUMERIC = '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMERIC = '0123456789';

const createNanoId = (size = 5, type: 'NumbersOnly' | 'AlphaNumeric' = 'AlphaNumeric'): string => {
  const id = generate(type === 'AlphaNumeric' ? ALPHA_NUMERIC : NUMERIC, size);

  return id;
};

const createSampleName = (): string => {
  const chance = new Chance();

  return chance.name();
};

const createSampleAddress = (): {
  address: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
} => {
  const chance = new Chance();

  return {
    address: chance.street(),
    city: chance.city(),
    state: chance.state(),
    zip: chance.zip(),
  };
};

const combineAddress = (
  {
    streetAddress1,
    streetAddress2,
    city,
    state,
    postalCode,
  }: {
    streetAddress1: string;
    streetAddress2?: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  },
  isInline = false,
): string => {
  const appendedStreetLine = streetAddress2 ? ` ${streetAddress2}` : '';

  if (isInline) {
    return `${streetAddress1}${appendedStreetLine}, ${city}, ${state} ${postalCode}`;
  }

  return `${streetAddress1}${appendedStreetLine}\n${city}, ${state} ${postalCode}`;
};

const createSamplePhone = (): string => {
  const chance = new Chance();

  return chance.phone();
};

const createSampleEmail = (): string => {
  const chance = new Chance();

  return chance.email();
};

const repeatMethod = <T>(fn: () => T, repeat: number): T[] => {
  const results: T[] = [];

  for (let i = 0; i < repeat; i += 1) {
    results.push(fn());
  }

  return results;
};

const getRandomItemFromList = <T>(list: T[]): T | undefined => {
  if (list.length === 0) {
    return undefined;
  }

  const randomIndex = Math.floor(Math.random() * list.length);

  return list[randomIndex];
};

const areEqual = <T>(objectA: T, objectB: T): boolean => {
  return deepEqual(objectA, objectB);
};

function getChangedFields(oldObj: Record<string, any>, newObj: Record<string, any>): Record<string, any> {
  const changes: Record<string, any> = {};

  for (const key in newObj) {
    if (!deepEqual(oldObj[key], newObj[key])) {
      if (
        typeof newObj[key] === 'object' &&
        typeof oldObj[key] === 'object' &&
        oldObj[key] !== null &&
        newObj[key] !== null
      ) {
        const nestedChanges = getChangedFields(oldObj[key], newObj[key]);
        if (Object.keys(nestedChanges).length > 0) {
          changes[key] = nestedChanges;
        }
      } else {
        changes[key] = newObj[key];
      }
    }
  }

  return changes;
}

const getAudienceVisibilityFeature = (featureName: string): AudienceEnum => {
  if (featureName === 'Story') {
    return AudienceEnum.Branch;
  }

  if (featureName === 'Recognition') {
    return AudienceEnum.Branch;
  }

  return AudienceEnum.Branch;
};

const getMatchesInArrays = (leftArr: string[], rightArr: string[]): { matched: string[]; unmatched: string[] } => {
  const leftArrSet = new Set(leftArr);
  const matchedValues: string[] = [];
  const unmatchedValues: string[] = [];

  rightArr.forEach((rightArrItem) => {
    if (leftArrSet.has(rightArrItem)) {
      matchedValues.push(rightArrItem);

      return;
    }
    unmatchedValues.push(rightArrItem);
  });

  return { matched: matchedValues, unmatched: unmatchedValues };
};

const getTestUserPsId = (testUserEmail: string): string => {
  const testUserAccounts = {
    obtestanita: '0000023456',
    obtestjames: '0000023457',
    obtestnita: '0000023458',
    obtestsamantha: '0000023459',
    obtestrita: '0000023460',
    obtestjason: '0000023461',
    obtestgeorge: '0000023462',
    obtestsunita: '0000023463',
  };

  const [username] = testUserEmail.split('@');

  if (testUserAccounts[username.toLowerCase()]) {
    testUserAccounts[username.toLowerCase()];
  }

  return 'UNKNOWN_PSID';
};

const chunkArray = <T>(inputArr: T[] = [], bucketSize = 100): T[][] => {
  const outputArr = [];
  const loopCount = Math.floor(inputArr.length / bucketSize);

  for (let i = 0; i <= loopCount; i += 1) {
    outputArr.push(inputArr.slice(i * bucketSize, (i + 1) * bucketSize));
  }

  return outputArr;
};

const wait = (delay = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, delay));

const resolveByBatch = async <T>(
  array: T[],
  batchSize: number,
  processFn: (batch: T[]) => Promise<void>,
): Promise<void> => {
  const batches = chunkArray(array, batchSize);

  for (const batch of batches) {
    await processFn(batch);

    await wait(1500);
  }
};

const resolveByBatchV2 = async <ArrayT, ReturnT>(
  transactionId: string,
  array: ArrayT[],
  processFn: (transactionId: string, batch: ArrayT[]) => Promise<ReturnT[]>,
  batchSize = 100,
  waitTimeInMs = 500,
): Promise<ReturnT[]> => {
  const processFnResults: ReturnT[] = [];

  const batches = chunkArray(array, batchSize);

  for (const batch of batches) {
    const processFnResult: ReturnT[] = await processFn(transactionId, batch);

    processFnResult.forEach((eachResult) => {
      processFnResults.push(eachResult);
    });

    await wait(waitTimeInMs);
  }

  return processFnResults;
};

const convertToTimezone = (inputDate: Date, timezoneDescriptor: string): Date => {
  const convertedDate = toZonedTime(inputDate, timezoneDescriptor);

  return convertedDate;
};

const convertFromTimezone = (inputDate: Date, timezoneDescriptor: string): Date => {
  const convertedDate = fromZonedTime(inputDate, timezoneDescriptor);

  return convertedDate;
};

const extractAddress = (address: AddressType): ReadableAddressType => {
  let streetAddress = '';

  if (address.streetAddress) {
    streetAddress = address.streetAddress;
  } else if (address.streetAddress1) {
    streetAddress = address.streetAddress1;
  }

  if (address.streetAddress2) {
    streetAddress = `${streetAddress}\n${address.streetAddress2}`;
  } else if (address.streetAddressLine2) {
    streetAddress = `${streetAddress}\n${address.streetAddressLine2}`;
  }

  const province = address.province || address.state || '';

  return {
    address: streetAddress,
    city: address.city,
    province,
    postalCode: address.postalCode,
    country: address.country,
  };
};

const dateWithoutTZ = (date: Date, timezone?: string): string => {
  if (!timezone) {
    return date.toISOString().slice(0, -5);
  }

  return convertToTimezone(date, timezone).toISOString().slice(0, -5);
};

const dateWithTZ = (date: Date, timezone?: string): string => {
  if (!timezone) {
    return date.toISOString().slice(0, -5);
  }

  return convertFromTimezone(date, timezone).toISOString().slice(0, -5);
};

const compareLists = <T>(listA: T[], listB: T[]): boolean => {
  const listMapA = new Map(listA.map((item) => [JSON.stringify(item), item]));
  const listMapB = new Map(listB.map((item) => [JSON.stringify(item), item]));

  const listAKeys = Array.from(listMapA.keys());
  const listBKeys = Array.from(listMapB.keys());

  const listASet = new Set(listAKeys);
  const listBSet = new Set(listBKeys);

  const listAKeysLength = listAKeys.length;
  const listBKeysLength = listBKeys.length;

  const listAKeysSetLength = listASet.size;
  const listBKeysSetLength = listBSet.size;

  if (listAKeysLength !== listBKeysLength) {
    return false;
  }

  return listAKeysSetLength === listBKeysSetLength && listAKeys.every((key) => listBSet.has(key));
};

const getTestUserProcuraDetails = (testUserPsId: string): ProcuraEmployeePayloadType[] => {
  const customProcuraTestId = {
    '0000023458': 'Mh0000000xqt7u',
    '0000023459 ': 'Mh0000000xqt7y',
    '0000023457': 'Mh0000001pknhx',
    '0000023456': 'Mh0000001pkpse',
  };

  if (!customProcuraTestId[testUserPsId]) {
    return [];
  }

  return [
    {
      employeeId: customProcuraTestId[testUserPsId],
      tenantId: 'Procura_Leapfrog',
      systemType: 'procura',
      employeePsId: testUserPsId,
    },
  ];
};

const isTestUser = (email: string): boolean => {
  return email.toLowerCase().startsWith('obtest');
};

// Retrieves the effective user job by merging overridden and default job
const getEffectiveJobRole = (
  currentJob: OBUserAccessSchemaType,
  defaultJob: OBUserJobSchemaType,
  shouldOverride = true,
): OBUserJobSchemaType => {
  if (!shouldOverride) {
    return defaultJob;
  }

  const job: Partial<OBUserJobSchemaType> = {};

  job.level = currentJob.level;
  job.jobId = currentJob.jobId ?? defaultJob.jobId;

  return job as OBUserJobSchemaType;
};

// Retrieves the effective branch IDs based on overridden branch IDs and default branch IDs
const getEffectiveBranchIds = (overriddenBranchIds: string[], branchIds: string[]): string[] => {
  return overriddenBranchIds?.length ? overriddenBranchIds : branchIds;
};

// Combines two string arrays, removing any duplicates.
const getUniqueStringsFromList = (firstArray: string[], secondArray: string[]): string[] => {
  const uniqueStrings = new Set([...(firstArray ?? []), ...(secondArray ?? [])]);

  return Array.from(uniqueStrings);
};

// TODO: Will need improvisation later
const sanitizeText = (text: string): string => {
  try {
    if (!text) {
      return '';
    }

    if (text.includes('\\') && text.includes('Client LB-')) {
      const [, context = ''] = text.split('Client LB-');

      const [readableContent = ''] = context.split('\\');

      return readableContent.trim();
    }

    if (text.includes('\\') && text.includes('{')) {
      const contextBlock = text.split('\\').find((txt) => txt.includes('fs20'));

      if (!contextBlock) {
        return text.split('\\').join(' ').trim();
      }

      return contextBlock.replace('fs20', '').trim();
    }

    return text;
  } catch (parseErr) {
    return text;
  }
};

const sortListByDate = <T>(list: T[], dateFieldName: string, direction: 'Asc' | 'Desc' = 'Desc'): T[] => {
  if (list.length === 0) {
    return list;
  }

  return [...list].sort((itemA, itemB) => {
    if (direction === 'Desc') {
      return new Date(itemB[dateFieldName]).getTime() - new Date(itemA[dateFieldName]).getTime();
    }

    return new Date(itemA[dateFieldName]).getTime() - new Date(itemB[dateFieldName]).getTime();
  });
};
const convertExcelSerialDateToJSDate = (excelSerialDate: number, makeDateSpecificToHour = false): Date => {
  const dateHour = makeDateSpecificToHour ? (excelSerialDate - Math.floor(+excelSerialDate)) * 24 : 0;

  return new Date(Date.UTC(0, 0, excelSerialDate - 1, dateHour));
};

const findDurationGap = (startDate: Date, endDate: Date): string => {
  const diffInDays = Math.abs(differenceInDays(startDate, endDate));

  if (diffInDays > 0) {
    return diffInDays === 1 ? `${diffInDays} day` : `${diffInDays} days`;
  }

  const diffInHours = Math.abs(differenceInHours(startDate, endDate));
  const diffInMins = Math.abs(differenceInMinutes(startDate, endDate));
  const remainingMins = diffInMins % 60;

  if (diffInHours > 0) {
    if (remainingMins === 0) {
      return diffInHours === 1 ? `${diffInHours} hour` : `${diffInHours} hours`;
    }

    return `${diffInHours}:${`0${remainingMins}`.slice(-2)} hours`;
  }

  return `${remainingMins} mins`;
};

// Function to convert a camelCase string to Title Case
const camelCaseToTitleCase = (text: string): string => {
  // Example: "camel Case" -> "Camel Case"

  return text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^\w/, (word) => word.toUpperCase());
};

const capitalize = (text: string): string => {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};

/**
 * The date string to be formatted (e.g., '2024-04-26T16:18:01.209Z').
 * The formatted date string (e.g., 'Apr 26, 2024').
 */

const formatDate = (dateString: string | Date, dateFormat = 'MM/dd/yyyy'): string => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  return format(date, dateFormat);
};

/**
 * @see https://date-fns.org/v3.6.0/docs/differenceInDays
 */
const differenceInDaysOnly = (dateLeft: Date, dateRight: Date): number => {
  // Ignore DST
  return Math.trunc(differenceInHours(dateLeft, dateRight) / 24) | 0;
};

const joinTextsForDesc = (texts: string[], separator = ' - '): string => {
  const availableTexts = texts.filter((txt) => Boolean(txt));

  return availableTexts.join(separator);
};

const timeTrackStart = (): number => {
  return Date.now();
};

const timeTrackEnd = (startedValue: number): string => {
  try {
    return ms(Date.now() - startedValue);
  } catch (calcErr) {
    return '';
  }
};

const encodeGeo = (latitude: string, longitude: string, key: string): string => {
  return encryptText(`${latitude}:${longitude}`, key);
};

const decodeGeo = (encodedGeo: string, key: string): { latitude: string; longitude: string } | null => {
  const decodedGeo = decryptText(encodedGeo, key);
  if (!decodedGeo) {
    return null;
  }

  const [latitude, longitude] = decodedGeo.split(':');

  return { latitude, longitude };
};

const validateEmail = (email: string): boolean => {
  // Regular expression for basic email validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  return emailRegex.test(email);
};

const validatePhoneNumber = (phone: string): boolean => {
  // Regular expression for validating phone numbers
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;

  return phoneRegex.test(phone);
};

const validateFileType = (requestFileType: string): boolean => {
  // Check if the requestFileType is provided and is a string
  if (typeof requestFileType !== 'string') {
    return false;
  }

  // Define allowed file types
  const allowedFileTypes = ['png', 'jpeg', 'jpg', 'buffer'];

  // Normalize the fileType from the request
  const normalizedFileType = requestFileType.trim().toLowerCase();
  const mimeType = `image/${normalizedFileType}`;
  const allowedMimeTypes = allowedFileTypes.map((type) => `image/${type}`);

  return allowedMimeTypes.includes(mimeType);
};

const isBoolean = (value: boolean): boolean => typeof value === 'boolean';

const isArrayExists = (array: any[]): boolean => Array.isArray(array) && array.length > 0;

const isNumber = (value: number): boolean => Number.isFinite(value);

export {
  createNanoId,
  chunkArray,
  getTestUserPsId,
  getMatchesInArrays,
  getAudienceVisibilityFeature,
  convertToTimezone,
  addMinutes,
  addHours,
  subHours,
  subMinutes,
  addDays,
  isBefore,
  isValidDate,
  subDays,
  isEqualDate,
  startOfDay,
  endOfDay,
  resolveByBatch,
  areEqual,
  createSampleName,
  createSampleAddress,
  createSamplePhone,
  createSampleEmail,
  getRandomItemFromList,
  repeatMethod,
  resolveByBatchV2,
  dateWithoutTZ,
  dateWithTZ,
  extractAddress,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInDaysOnly,
  getTestUserProcuraDetails,
  getEffectiveJobRole,
  getEffectiveBranchIds,
  getUniqueStringsFromList,
  sanitizeText,
  capitalize,
  sortListByDate,
  convertExcelSerialDateToJSDate,
  camelCaseToTitleCase,
  findDurationGap,
  formatDate,
  isTestUser,
  combineAddress,
  joinTextsForDesc,
  isSameDay,
  timeTrackStart,
  timeTrackEnd,
  encodeGeo,
  decodeGeo,
  validateEmail,
  validatePhoneNumber,
  validateFileType,
  getChangedFields,
  startOfMonth,
  endOfMonth,
  isBoolean,
  isArrayExists,
  isNumber,
  compareLists,
};

export { rtfToTxt } from './rtf_helper.group';
