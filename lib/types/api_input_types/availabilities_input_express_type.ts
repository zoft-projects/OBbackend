import { PriorityEnum } from '../../enums';

type HttpPOSTAvailabilityPushNotification = {
  employeePsId: string;
  priority: PriorityEnum;
  notificationTitle: string;
  notificationBody: string;
};

export { HttpPOSTAvailabilityPushNotification };
