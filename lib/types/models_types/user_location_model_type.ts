type OBUserLocationSchemaType = {
  locationId: string;
  groupId: string;
  employeePsId: string;
  encodedGeo: string;
  visitId?: string;
  tenantId?: string;
  clientId?: string;
  cvid?: string;
  comment?: string;
  captureType?: string;
  updatedBy?: string;
  deviceTime: Date;
  createdAt: Date;
  updatedAt: Date;
};

export { OBUserLocationSchemaType };
