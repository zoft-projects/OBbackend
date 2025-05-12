type OBWellnessNoteSchemaType = {
  id?: string;
  noteId: string;
  employeePsId: string;
  employeeName: string;
  note: string;
  visitId: string;
  tenantId?: string;
  clientId?: string;
  clientDisplayName?: string;
  cvid: string;
  branchId: string;
  checkoutAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export { OBWellnessNoteSchemaType };
