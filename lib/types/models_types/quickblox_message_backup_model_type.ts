type OBQuickBloxMessageBackupSchemaType = {
  _id: string;
  attachments?: {
    type: string;
    id: string;
  }[];
  chatDialogId: string;
  createdAt: Date;
  senderId: string;
  dateSent: Date;
  customSenderId?: string;
  deliveredIds?: string[];
  markable?: string;
  message?: string;
  messageType?: string;
  readIds?: string[];
  recipientId?: string;
  allRead?: boolean;
  updatedAt?: Date;
  read?: string;
};

export { OBQuickBloxMessageBackupSchemaType };
