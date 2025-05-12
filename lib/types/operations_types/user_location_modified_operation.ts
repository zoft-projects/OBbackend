export type UserLocationModifiedOperationType = {
  locationId: string;
  groupId: string;
  employeePsId: string;
  latitude: string;
  longitude: string;
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
