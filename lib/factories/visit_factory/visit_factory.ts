import { VisitActionEnum, VisitTypeEnum } from '../../enums';
import { ClientFromSystemType, VisitPayloadType, VisitFromSystemType } from '../../types';
import {
  createNanoId,
  addHours,
  subHours,
  createSampleName,
  createSamplePhone,
  getRandomItemFromList,
  createSampleAddress,
  createSampleEmail,
  combineAddress,
} from '../../utils';

/**
 * Factory Name: visit_factory
 * Description: This factory is to provide sample data for visits
 */

const generateRandomVisitsPayload = (count = 10, overrideProps: Partial<VisitPayloadType> = {}): VisitPayloadType[] => {
  const sampleVisits: VisitPayloadType[] = [];
  const randomHours = [0, 2, 4, 6, 24, 40, 48, 64];

  for (let i = 0; i < count; i += 1) {
    const visitStartDate = addHours(new Date(), getRandomItemFromList(randomHours));
    const visitEndDate = addHours(visitStartDate, 2);
    const visitAvailableAfter = subHours(visitStartDate, 6);

    const randomAddress = createSampleAddress();

    const clientAddress = {
      streetAddress1: randomAddress.address,
      streetAddress2: randomAddress.address2,
      city: randomAddress.city,
      state: randomAddress.state,
      country: 'CA',
      postalCode: randomAddress.zip,
    };

    const sampleVisit: VisitPayloadType = {
      visitId: `TEST000${createNanoId(6, 'NumbersOnly')}`,
      cvid: `${createNanoId(4, 'NumbersOnly')}`,
      visitStartDate: visitStartDate.toISOString().slice(0, -5),
      visitEndDate: visitEndDate.toISOString().slice(0, -5),
      visitAvailableAfter: visitAvailableAfter.toISOString().slice(0, -5),
      clientPsId: `000${createNanoId(7, 'NumbersOnly')}`,
      clientId: `CL0${createNanoId(7)}`,
      tenantId: 'Procura_LeapFrog',
      clientName: createSampleName(),
      clientPhone: createSamplePhone(),
      clientAddress,
      clientAddressFormatted: combineAddress(clientAddress),
      visitStatus: 'A',
      clientStatus: 'A',
      visitType: VisitTypeEnum.Regular,
      serviceId: `SERV0${createNanoId(5)}`,
      serviceName: 'Service test',
      actionStatus: VisitActionEnum.Unknown,
    };

    sampleVisits.push({
      ...sampleVisit,
      ...overrideProps,
    });
  }

  return sampleVisits;
};

const generateRandomVisitFromSystem = (
  overrideVisitProps: Partial<VisitFromSystemType> = null,
): VisitFromSystemType => {
  const randomHours = [0, 2, 4, 6, 24, 40, 48, 64];

  const visitStartDate = addHours(new Date(), getRandomItemFromList(randomHours));
  const visitEndDate = addHours(visitStartDate, 2);

  return {
    visitId: overrideVisitProps?.visitId ?? `TEST000${createNanoId(6, 'NumbersOnly')}`,
    tenantId: overrideVisitProps?.tenantId ?? 'Procura_LeapFrog',
    systemType: overrideVisitProps?.systemType ?? 'procura',
    cvid: overrideVisitProps?.cvid ?? `${createNanoId(4, 'NumbersOnly')}`,
    startDateTime: overrideVisitProps?.startDateTime ?? visitStartDate.toISOString().slice(0, -5),
    endDateTime: overrideVisitProps?.endDateTime ?? visitEndDate.toISOString().slice(0, -5),
    clientPsId: overrideVisitProps?.clientPsId ?? `000${createNanoId(7, 'NumbersOnly')}`,
    clientId: overrideVisitProps?.clientId ?? `CL0${createNanoId(7)}`,
    scheduledEmployeeIds: overrideVisitProps?.scheduledEmployeeIds ?? [`M000${createNanoId(6, 'NumbersOnly')}`],
    service: {
      serviceId: `SERV0${createNanoId(5)}`,
      serviceName: 'Test Service',
    },
    status: 'Active',
    timezone: 'America/New_York',
    statusInSystem: 'A',
    confirmedByClient: true,
    visitType: 'WX',
    adlChecklist: overrideVisitProps?.adlChecklist ?? [],
    billable: true,
  };
};

const generateRandomClientFromSystem = (
  overrideClientProps: Partial<ClientFromSystemType> = null,
): ClientFromSystemType => {
  const randomAddress = createSampleAddress();

  return {
    firstName: createSampleName(),
    lastName: createSampleName(),
    phone: createSamplePhone(),
    address: {
      streetAddress1: randomAddress.address,
      streetAddress2: randomAddress.address2,
      city: randomAddress.city,
      state: randomAddress.state,
      country: 'CA',
      postalCode: randomAddress.zip,
    },
    autoEnrollMBC: 'Enrolled',
    clientId: `CL0${createNanoId(7)}`,
    peopleSoftId: `000${createNanoId(7, 'NumbersOnly')}`,
    branchId: '',
    createdAt: new Date().toISOString(),
    email: createSampleEmail(),
    status: 'Active',
    statusInSystem: 'A',
    tenantId: 'Procura_Leapfrog',
    systemType: 'procura',
    updatedAt: new Date().toISOString(),
    ...overrideClientProps,
  };
};

export { generateRandomVisitsPayload, generateRandomVisitFromSystem, generateRandomClientFromSystem };
