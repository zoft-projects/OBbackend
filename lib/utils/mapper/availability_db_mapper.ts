import {
  AudienceEnum,
  NotificationOriginEnum,
  NotificationPlacementEnum,
  NotificationTypeEnum,
  PriorityEnum,
} from '../../enums';
import {
  ClientFromSystemType,
  CreateOnetimeAvailabilityType,
  CreateRecurringAvailabilityType,
  DetailedOnetimeAvailabilityPayloadType,
  DetailedOnetimeAvailabilityType,
  HTTPPostAvailabilityOnetimeInputType,
  HttpPOSTAvailabilityPushNotification,
  NotificationUpsertOperationType,
  ScheduleSummaryGetType,
  ScheduleSummaryPayloadType,
  HTTPPostRecurringAvailabilityInputType,
} from '../../types';

const mapDbAvailabilityToApiPayload = (
  schedules: ScheduleSummaryGetType[],
  clientDetails: ClientFromSystemType[],
): ScheduleSummaryPayloadType => {
  const mapperSchedules = {} as ScheduleSummaryPayloadType;

  const clientHash: {
    [clientPsId: string]: ClientFromSystemType;
  } = {};

  clientDetails.forEach((client) => {
    clientHash[client.peopleSoftId] = client;
  });

  schedules.map((schedule) => {
    const scheduledVisits = (schedule.visits || []).map((visit) => {
      const client = clientHash[visit.clientPsId];
      let clientName = '';

      if (client) {
        clientName = `${client.firstName || ''} ${client.lastName || ''}`;
      }

      return {
        visitId: visit.visitId,
        startDate: visit.startDate,
        endDate: visit.endDate,
        description: visit.description,
        clientPsId: visit.clientPsId,
        clientId: visit.clientId,
        clientName,
        status: visit.status,
      };
    });

    const overridingAvailabilities = (schedule.availabilitiesOneTime || []).map((onetime) => {
      return {
        availabilityId: onetime.availabilityId,
        isAvailable: onetime.isAvailable,
        startDate: onetime.startDate,
        endDate: onetime.endDate,
        reason: onetime.reason,
      };
    });

    const defaultAvailabilities = (schedule.plannedAvailabilities || []).map((availability) => {
      return {
        startTime: availability.startTime,
        endTime: availability.endTime,
        description: availability.description,
      };
    });

    const plannedUnavailabilities = (schedule.plannedUnavailabilities || []).map((unavailability) => {
      return {
        id: unavailability.id,
        startTime: unavailability.startTime,
        endTime: unavailability.endTime,
        utcStartDateTime: unavailability.utcStartDateTime,
        utcEndDateTime: unavailability.utcEndDateTime,
        reason: unavailability.reason,
      };
    });

    mapperSchedules[`${schedule.date}`] = {
      id: schedule.id,
      scheduledVisits,
      overridingAvailabilities,
      defaultAvailabilities,
      plannedUnavailabilities,
      timezone: schedule.timezone,
      totalAvailabilityInHrs: schedule.totalAvailability,
    };
  });

  return mapperSchedules as ScheduleSummaryPayloadType;
};

const mapOnetimeApiRequestToServiceRequest = (
  onetimeDetails: HTTPPostAvailabilityOnetimeInputType,
): CreateOnetimeAvailabilityType => {
  const mappedPayload = {} as Partial<CreateOnetimeAvailabilityType>;

  if (onetimeDetails.date) {
    mappedPayload.date = new Date(onetimeDetails.date);
  }

  if (onetimeDetails.givenName) {
    mappedPayload.givenName = onetimeDetails.givenName;
  }

  if (onetimeDetails.employeePsId) {
    mappedPayload.employeePsId = onetimeDetails.employeePsId;
  }

  if (onetimeDetails.timeSlots) {
    mappedPayload.timeSlots = (onetimeDetails.timeSlots || []).map((slot) => {
      return { start: new Date(slot.start), end: new Date(slot.end) };
    });
  }

  mappedPayload.available = false;
  if (onetimeDetails.available) {
    mappedPayload.available = onetimeDetails.available;
  }

  if (onetimeDetails.timezone) {
    mappedPayload.timezone = onetimeDetails.timezone;
  }

  if (onetimeDetails.reason) {
    mappedPayload.reason = onetimeDetails.reason;
  }

  if (onetimeDetails.comments) {
    mappedPayload.comments = onetimeDetails.comments;
  }

  return mappedPayload as CreateOnetimeAvailabilityType;
};

const mapRecurringAvailabilityApiRequestToServiceRequest = (
  recurringAvailabilityDetails: HTTPPostRecurringAvailabilityInputType,
): CreateRecurringAvailabilityType => {
  const mappedPayload = {} as Partial<CreateRecurringAvailabilityType>;

  if (recurringAvailabilityDetails.employeeId) {
    mappedPayload.employeeId = recurringAvailabilityDetails.employeeId;
  }

  if (recurringAvailabilityDetails.tenantId) {
    mappedPayload.tenantId = recurringAvailabilityDetails.tenantId;
  }

  if (recurringAvailabilityDetails.recurrencePattern) {
    mappedPayload.recurrencePattern = recurringAvailabilityDetails.recurrencePattern;
  }

  if (recurringAvailabilityDetails.timeslots) {
    mappedPayload.timeslots = (recurringAvailabilityDetails.timeslots || []).map((slot) => {
      return { days: slot.days, startTime: slot.startTime, endTime: slot.endTime };
    });
  }

  if (recurringAvailabilityDetails.startDate) {
    mappedPayload.startDate = recurringAvailabilityDetails.startDate;
  }

  if (recurringAvailabilityDetails.endDate) {
    mappedPayload.endDate = recurringAvailabilityDetails.endDate;
  }

  if (recurringAvailabilityDetails.timezone) {
    mappedPayload.timezone = recurringAvailabilityDetails.timezone;
  }

  if (typeof recurringAvailabilityDetails.isAvailable === 'boolean') {
    mappedPayload.isAvailable = recurringAvailabilityDetails.isAvailable;
  }

  return mappedPayload as CreateRecurringAvailabilityType;
};

const mapDbOnetimeToApiPayload = (
  availabilities: DetailedOnetimeAvailabilityType[],
): DetailedOnetimeAvailabilityPayloadType[] => {
  const mappedOneTimeAvailabilities = [] as DetailedOnetimeAvailabilityPayloadType[];

  availabilities.map((onetime) => {
    mappedOneTimeAvailabilities.push({
      id: onetime.availabilityId,
      status: onetime.approvalStatus,
      date: onetime.availabilityDate,
      times: onetime.availableTimes,
      isAvailable: onetime.isAvailable,
      reason: onetime.reason,
    });
  });

  return mappedOneTimeAvailabilities;
};

const mapAvailabilityNotificationHttpToOperationType = (
  httpNotification: HttpPOSTAvailabilityPushNotification,
): NotificationUpsertOperationType => {
  const mappedNotification = {
    notificationPlacements: [NotificationPlacementEnum.Push],
    notificationVisibility: AudienceEnum.Individual,
    notificationType: NotificationTypeEnum.Individual,
    notificationOrigin: NotificationOriginEnum.System,
    audienceLevel: AudienceEnum.Individual,
  } as Partial<NotificationUpsertOperationType>;

  if (httpNotification.employeePsId) {
    mappedNotification.userPsIds = [httpNotification.employeePsId];
  }

  if (httpNotification.priority && httpNotification.priority in PriorityEnum) {
    mappedNotification.priority = httpNotification.priority;
  } else {
    mappedNotification.priority = PriorityEnum.Low;
  }

  if (httpNotification.notificationTitle) {
    mappedNotification.notificationTitle = httpNotification.notificationTitle;
  }

  if (httpNotification.notificationBody) {
    mappedNotification.notificationBody = httpNotification.notificationBody;
  }

  return mappedNotification as NotificationUpsertOperationType;
};

export {
  mapAvailabilityNotificationHttpToOperationType,
  mapDbAvailabilityToApiPayload,
  mapDbOnetimeToApiPayload,
  mapOnetimeApiRequestToServiceRequest,
  mapRecurringAvailabilityApiRequestToServiceRequest,
};
