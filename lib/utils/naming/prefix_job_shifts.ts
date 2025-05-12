const prefixJobShifts = (id: string): string => {
  const jobShiftId = `JB${id}`;

  return jobShiftId;
};

export { prefixJobShifts };
