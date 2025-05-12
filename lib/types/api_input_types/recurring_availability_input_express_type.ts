type TimeSlotType = {
  days: string[];
  startTime: string;
  endTime: string;
};

type HTTPPostRecurringAvailabilityInputType = {
  startDate: string;
  endDate?: string;
  timeslots: TimeSlotType[];
  recurrencePattern: string;
  employeeId: string;
  tenantId: string;
  timezone: string;
  isAvailable: boolean;
};

export { HTTPPostRecurringAvailabilityInputType };
