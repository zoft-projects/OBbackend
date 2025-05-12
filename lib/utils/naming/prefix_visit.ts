const prefixOngoingVisit = (psId: string): string => {
  return `current_visit_${psId}`;
};

const prefixFailedVisitAttempt = (cvid: string, tenantId: string, psId: string): string => {
  return `failed_visit_cvid:${cvid}_tenantId:${tenantId}_psId:${psId}`;
};

export { prefixOngoingVisit, prefixFailedVisitAttempt };
