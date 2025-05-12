type HTTPPostAvailabilityOnetimeInputType = {
  date: string;
  available: boolean;
  timeSlots?: { start: string; end: string }[];
  employeePsId: string;
  timezone: string;
  reason?: string;
  comments?: string;
  givenName: string;
};

export { HTTPPostAvailabilityOnetimeInputType };
