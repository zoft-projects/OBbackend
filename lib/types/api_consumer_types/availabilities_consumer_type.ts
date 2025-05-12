type VisitFromAvailabilitiesType = {
  visitId: string;
  startDate: string;
  endDate: string;
  description: string;
  clientPsId: string;
  clientId: string;
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

type PlannedUnavailability = {
  id: string;
  startTime: string;
  endTime: string;
  utcStartDateTime: string;
  utcEndDateTime: string;
  reason: string;
};

type ScheduleSummaryGetType = {
  id: string;
  employeeId: string;
  date: Date;
  visits: VisitFromAvailabilitiesType[];
  availabilitiesOneTime: AvailabilitiesOneTimeType[];
  plannedAvailabilities: PlannedAvailabilityType[];
  plannedUnavailabilities: PlannedUnavailability[];
  timezone?: string;
  totalAvailability: number;
};

type CreateOnetimeAvailabilityType = {
  date: Date;
  available: boolean;
  timeSlots?: { start: Date; end: Date }[];
  timezone: string;
  reason?: string;
  comments?: string;
  givenName: string;
  employeePsId: string;
};

type TimeSlotType = {
  days: string[];
  startTime: string;
  endTime: string;
};

type CreateRecurringAvailabilityType = {
  startDate: string;
  endDate?: string;
  timeslots: TimeSlotType[];
  recurrencePattern: string;
  employeeId: string;
  tenantId: string;
  timezone: string;
  isAvailable: boolean;
};

type DetailedOnetimeAvailabilityType = {
  availabilityId: string;
  employeeId: string;
  tenantId: string;
  systemType: string;
  deptId: string;
  timezone: string;
  employeePsId: string;
  approvalStatus: string;
  isApprovalRequired: boolean;
  isAvailable: boolean;
  reason: string;
  isApproved: boolean;
  availabilityDate: Date;
  availableTimes: { start: Date; end: Date }[];
};

export {
  CreateOnetimeAvailabilityType,
  ScheduleSummaryGetType,
  DetailedOnetimeAvailabilityType,
  CreateRecurringAvailabilityType,
};
