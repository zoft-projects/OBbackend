import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBQuickBloxMessageBackupSchemaType } from '../../types';

const AttachmentSchema = new Schema(
  {
    type: { type: String, required: true },
    id: { type: String, required: true },
  },
  { _id: false },
);

const OBQuickBloxMessageBackupSchema = new Schema<OBQuickBloxMessageBackupSchemaType>({
  _id: { type: String, required: true },
  attachments: [{ type: AttachmentSchema }],
  chatDialogId: { type: String, required: true },
  createdAt: { type: Date, required: true },
  senderId: { type: String, required: true },
  dateSent: { type: Date, required: true },
  customSenderId: { type: String },
  deliveredIds: [{ type: String }],
  markable: { type: String },
  message: { type: String },
  messageType: { type: String },
  readIds: [{ type: String }],
  recipientId: { type: String },
  allRead: { type: Boolean },
  updatedAt: { type: Date },
  read: { type: String },
});

OBQuickBloxMessageBackupSchema.index(
  { chatDialogId: 1, dateSent: -1, senderId: 1 },
  {
    background: true,
    name: 'quickblox-messages_chat_dialog_id_date_sent_desc_idx',
  },
);

export const OBQuickBloxMessageBackupModel: Model<OBQuickBloxMessageBackupSchemaType> = model(
  MongoCollection.OneBayshoreQuickBloxMessageBackupCollection,
  OBQuickBloxMessageBackupSchema,
);
