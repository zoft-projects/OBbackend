type VisitFromAvailabilitiesType = {
  visitId: string;
  startDate: string;
  endDate: string;
  description: string;
  clientPsId: string;
  clientId: string;
  clientName: string;
  status: string;
};

type AvailabilitiesOneTimeType = {
  availabilityId: string;
  isAvailable: boolean;
  startDate: string;
  endDate: string;
  reason: string;
};

type PlannedAvailabilityType = {
  startTime: string;
  endTime: string;
  description: string;
};

type PlannedUnavailabilityType = {
  id: string;
  startTime: string;
  endTime: string;
  utcStartDateTime: string;
  utcEndDateTime: string;
  reason: string;
};

type ScheduleSummaryDetailsType = {
  id: string;
  scheduledVisits: VisitFromAvailabilitiesType[];
  overridingAvailabilities: AvailabilitiesOneTimeType[];
  defaultAvailabilities: PlannedAvailabilityType[];
  plannedUnavailabilities: PlannedUnavailabilityType[];
  timezone?: string;
  totalAvailabilityInHrs: number;
};

export type DetailedOnetimeAvailabilityPayloadType = {
  id: string;
  status: string;
  isAvailable: boolean;
  reason: string;
  date: Date;
  times: { start: Date; end: Date }[];
};

export type ScheduleSummaryPayloadType = {
  [key: string]: ScheduleSummaryDetailsType;
};
