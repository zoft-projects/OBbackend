import { AudienceEnum } from '../../enums';

type AlertPayloadType = {
  alertId: string;
  alertTitle: string;
  alertDescription: string;
  alertTag: AudienceEnum;
  alertCreatedDate: Date;
  alertExpiresAtDate?: Date;
  alertCreatedBy: {
    employeePsId: string;
    displayName?: string;
    userImageLink?: string;
  };
};

export { AlertPayloadType };
