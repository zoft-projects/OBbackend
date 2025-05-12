type OBWellnessNoteUpsertOperationType = {
  noteId?: string;
  employeePsId: string;
  employeeName: string;
  note: string;
  visitId: string;
  tenantId: string;
  clientId: string;
  clientDisplayName?: string;
  cvid: string;
  branchId: string;
  checkoutAt: Date;
};

export { OBWellnessNoteUpsertOperationType };
