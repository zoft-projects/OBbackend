import { ProvincialCodesEnum, UserLevelEnum, UserStatusEnum } from '../../enums';
import { OBUserSchemaType, UserLocationPayloadType } from '../../types';
import { createNanoId, createSampleName, createSampleEmail, repeatMethod } from '../../utils';

/**
 * Factory Name: user_factory
 * Description: This factory is to provide sample data for users
 */

const generateRandomUserDBEntry = (overrideProps: Partial<OBUserSchemaType> = {}): OBUserSchemaType => {
  const randomName = createSampleName();
  const firstName = randomName.split(' ')[0];

  const sampleBranch: OBUserSchemaType = {
    employeePsId: `000${createNanoId(7, 'NumbersOnly')}`,
    workEmail: `${firstName}@testmail.com`,
    obAccess: {
      jobId: `${createNanoId(3, 'NumbersOnly')}`,
      level: 5,
      name: UserLevelEnum.BRANCH_ADMIN,
    },
    activeStatus: UserStatusEnum.Active,
    wasActivated: true,
    branchAccess: {
      canAccessAll: false,
      hasMultiple: false,
      selectedBranchIds: repeatMethod(() => createNanoId(3, 'NumbersOnly'), 10),
    },
    provinces: {
      canAccessAll: false,
      hasMultiple: true,
      provincialCodes: [ProvincialCodesEnum.ON],
    },
    job: {
      jobId: createNanoId(6, 'NumbersOnly'),
      code: 'Test Job Code',
      title: 'Test Title',
      level: 5,
    },
    deviceTokens: [{ deviceId: 'Test Token', hasEnabled: true }],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { ...sampleBranch, ...overrideProps };
};

const generateRandomUserDBEntries = (count = 10, overrideProps: Partial<OBUserSchemaType> = {}): OBUserSchemaType[] => {
  const sampleBranches: OBUserSchemaType[] = [];

  for (let i = 0; i < count; i += 1) {
    sampleBranches.push(generateRandomUserDBEntry(overrideProps));
  }

  return sampleBranches;
};

const generateRandomGeoLocationEntry = (
  count = 10,
  overrideProps: Partial<UserLocationPayloadType> = {},
): UserLocationPayloadType => {
  const randomId = () =>
    Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, '0');

  const sampleGeocodes = [
    ['37.7749', '-122.4194'],
    ['37.7767', '-122.4172'],
    ['37.7751', '-122.4205'],
    ['37.7738', '-122.4187'],
    ['37.7779', '-122.421'],
    ['37.7755', '-122.4198'],
    ['37.7742', '-122.4176'],
    ['37.7783', '-122.4201'],
    ['37.7735', '-122.4192'],
    ['37.7762', '-122.4223'],
    ['37.7758', '-122.4219'],
    ['37.7744', '-122.4181'],
    ['37.7739', '-122.421'],
    ['37.7772', '-122.4228'],
    ['37.7747', '-122.419'],
    ['37.7753', '-122.4185'],
    ['37.7776', '-122.4204'],
    ['37.7761', '-122.4215'],
    ['37.775', '-122.4187'],
    ['37.7746', '-122.4208'],
  ];

  const randomDate = (minsToAdd = 0) => {
    const startTime = new Date();
    startTime.setHours(8);
    startTime.setMinutes(startTime.getMinutes() + minsToAdd);

    return startTime.toISOString();
  };

  const getRandomGeo = () => sampleGeocodes[Math.floor(Math.random() * sampleGeocodes.length)];

  const geoLocations: UserLocationPayloadType['geoLocations'] = [];
  const clients = [
    {
      clientId: 'CL1234',
      clientName: createSampleName(),
      clientAddressFormatted: '301 Fell St, San Francisco, CA 94102, United States',
    },
    {
      clientId: 'CL6346',
      clientName: createSampleName(),
      clientAddressFormatted: '100 Van Ness Ave, San Francisco, CA 94102, United States',
    },
  ];

  for (let counter = 0; counter < count; counter += 1) {
    const [lat, lng] = getRandomGeo();
    let visitInfo: Partial<{
      captureType: string;
      cvid?: string;
      visitId?: string;
      tenantId?: string;
      deviceTime: string;
      clientId?: string;
      clientName?: string;
      clientAddressFormatted?: string;
      clientLatitude?: string;
      clientLongitude?: string;
    }> = null;

    if (Math.random() > 0.5) {
      const randomClient = clients[Math.floor(Math.random() * clients.length)];

      visitInfo = {
        cvid: `${Math.random().toString().slice(-4)}`,
        visitId: `visit${randomId()}`,
        tenantId: 'Procura_Leapfrog',
        captureType: 'Visit',
        ...randomClient,
      };
    }

    geoLocations.push({
      latitude: lat,
      longitude: lng,
      captureType: 'Breadcrumb',
      deviceTime: randomDate(counter * 15),
      ...visitInfo,
    });
  }

  const sampleGeoLocationEntry: UserLocationPayloadType = {
    employeeDetail: {
      psId: `ps${randomId()}`,
      displayName: createSampleName(),
      email: createSampleEmail(),
      lastLoggedAt: randomDate(),
    },
    geoLocations,
  };

  return { ...sampleGeoLocationEntry, ...overrideProps };
};

export { generateRandomUserDBEntries, generateRandomUserDBEntry, generateRandomGeoLocationEntry };
