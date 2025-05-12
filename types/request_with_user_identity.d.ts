import { EmployeePingIdentity } from '@bayshore-healthcare/lib-ping-authentication-middleware';

import { OneBayshoreUserIdentity } from '../lib/types';

declare global {
  namespace Express {
    interface Request {
      employeePingIdentity?: EmployeePingIdentity;
      txId: string;
      obUserIdentity?: OneBayshoreUserIdentity;
    }
  }
}
