import { sendNotification } from './notification_service';
import {
  NotificationPlacementEnum,
  NotificationTypeEnum,
  NotificationOriginEnum,
  AudienceEnum,
  ActiveStateEnum,
  PriorityEnum,
} from '../../enums';

const transactionId = 'test-transaction';

describe('sendNotification', () => {
  it('should throw an error when required fields are missing', async () => {
    const notificationData = {
      notificationPlacements: [],
    }; // Empty data to trigger the error

    await expect(sendNotification(transactionId, notificationData)).rejects.toThrow('Required fields are missing.');
  });

  it('should throw an error for invalid expiry date', async () => {
    const notificationData = {
      notificationPlacements: [NotificationPlacementEnum.Dashboard],
      userPsIds: ['userPsId1'],
      notificationId: 'notif-123',
      priority: PriorityEnum.High,
      notificationVisibility: 'Public',
      notificationType: NotificationTypeEnum.Individual,
      notificationOrigin: NotificationOriginEnum.System,
      notificationTitle: 'Test Notification',
      notificationBody: 'This is a test',
      expiresAt: 'invalid-date',
    };

    await expect(sendNotification(transactionId, notificationData)).rejects.toThrow('Invalid expiry date.');
  });

  it('should handle prerequisite notifications correctly', async () => {
    const notificationData = {
      notificationPlacements: [NotificationPlacementEnum.Prerequisites],
      audienceLevel: AudienceEnum.Branch,
      notificationId: 'prereq-456',
      notificationTitle: 'Test Prerequisite Notification',
      notificationBody: 'Prerequisite notification body',
      notificationType: NotificationTypeEnum.Individual,
      notificationOrigin: NotificationOriginEnum.System,
      priority: PriorityEnum.High,
      notificationVisibility: AudienceEnum.Branch,
      userPsIds: ['userPsId1'],
      status: ActiveStateEnum.Active,
    };

    const result = await sendNotification(transactionId, notificationData);

    expect(result).toBeDefined();
    expect(result).toBe(notificationData.notificationId);
  });

  it('should throw an error if priority is missing for a prerequisite notification', async () => {
    const notificationData = {
      notificationPlacements: [NotificationPlacementEnum.Prerequisites],
      audienceLevel: AudienceEnum.Branch,
      notificationId: 'prereq-missing-priority',
      notificationTitle: 'Missing Priority',
      notificationBody: 'This prerequisite notification does not include a priority level',
      // Omitted priority
      notificationType: NotificationTypeEnum.Individual,
      notificationOrigin: NotificationOriginEnum.System,
      notificationVisibility: AudienceEnum.Branch,
      userPsIds: ['userPsId1'],
      status: ActiveStateEnum.Active,
    };

    await expect(sendNotification(transactionId, notificationData)).rejects.toThrow(/priority.*is required/);
  });
});
