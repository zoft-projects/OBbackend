const prefixMilestoneId = (id: string): string => {
  const milestoneId = `MS0${id}`;

  return milestoneId;
};

const prefixMilestoneBatchId = (id: string): string => {
  const batchId = `MSBA0${id}`;

  return batchId;
};
export { prefixMilestoneId, prefixMilestoneBatchId };
