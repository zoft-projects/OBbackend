type UserLocationPayloadType = {
  employeeDetail: {
    psId: string;
    displayName: string;
    email: string;
    lastLoggedAt?: string;
  };
  geoLocations: {
    latitude: string;
    longitude: string;
    captureType: string;
    cvid?: string;
    visitId?: string;
    tenantId?: string;
    deviceTime: string;
    clientId?: string;
    clientName?: string;
    clientAddressFormatted?: string;
    clientLatitude?: string;
    clientLongitude?: string;
  }[];
};

export { UserLocationPayloadType };
