type HTTPPostUserLocationInputType = {
  groupId: string;
  latitude: string;
  longitude: string;
  visitId?: string;
  tenantId?: string;
  clientId?: string;
  cvid?: string;
  comment?: string;
  captureType?: string;
  deviceTime: Date;
};

export { HTTPPostUserLocationInputType };
