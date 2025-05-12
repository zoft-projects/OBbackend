import ms from 'ms';
import { createNanoId, createSampleAddress, createSampleName } from '../../utils';

/**
 * Factory Name: ping_identity_factory
 * Description: This factory is to provide sample data for employee Ping Idenitites
 */

type PingIdentityJsonType = { [key: string]: string | string[] | number | boolean };

// If not reusable then this could stay here
const epochTime = (date: Date = new Date()) => {
  return Math.floor(date.getTime() / 1000);
};

const generateRandomPingIdentityJson = (
  overrideProps: Partial<PingIdentityJsonType> = {},
  overriddenFirstName?: string,
  overriddenCity?: string,
  expiresInMs = ms('10s'),
): PingIdentityJsonType => {
  const city = overriddenCity ?? createSampleAddress().city;
  const firstName = overriddenFirstName ?? createSampleName().split(' ')[0];

  const samplePingIdentityJson: PingIdentityJsonType = {
    scope: ['openid profile'],
    client_id_name: `dx_client_${createNanoId(3, 'NumbersOnly')}`,
    agId: `${createNanoId(5, 'NumbersOnly')}`,
    physicalDeliveryOfficeName: `${city} Office`,
    whenCreated: new Date().toISOString().replace(/[:T-]/g, ''),
    mail: `${firstName}@testmail.com`,
    manager: createSampleName(),
    Username: `${firstName}@testmail.com`,
    phone: `${createNanoId(10, 'NumbersOnly')}`,
    givenName: firstName,
    memberOf: ['Test Group'],
    title: 'Virtual Test Employee',
    userPrincipalName: `${firstName}@NPbayshore.ca`,
    exp: epochTime() + expiresInMs / 1000,
    active: expiresInMs > 0,
    primary_email: `${firstName}@testmail.com`,
    employeeID: `000${createNanoId(7, 'NumbersOnly')}`,
  };

  return { ...samplePingIdentityJson, ...overrideProps };
};

export { generateRandomPingIdentityJson };
