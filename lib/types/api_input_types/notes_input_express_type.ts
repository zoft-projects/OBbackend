type HttpPostCreateNoteType = {
  clientId: string;
  tenantId: string;
  visitId: string;
  cvid: string;
  systemType?: string;
  noteForBranch: {
    subject?: string;
    content: string;
  };
};

export { HttpPostCreateNoteType };
