import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';

import { OBWellnessNoteSchemaType } from '../../types';

const oneBayshoreWellnessNoteSchema = new Schema<OBWellnessNoteSchemaType>({
  noteId: { type: String, required: true },
  employeePsId: { type: String, required: true },
  employeeName: { type: String, required: true },
  note: { type: String, required: true },
  visitId: { type: String, required: true },
  tenantId: { type: String },
  clientId: { type: String },
  clientDisplayName: { type: String },
  cvid: { type: String, required: true },
  branchId: { type: String, required: true },
  checkoutAt: { type: Date, required: true, default: Date.now },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

oneBayshoreWellnessNoteSchema.index(
  { noteId: 1, employeePsId: 1 },
  { unique: true, background: true, name: 'notes_noteId_employeePsId_uniq_idx' },
);

oneBayshoreWellnessNoteSchema.index(
  { branchId: 1, checkoutAt: -1 },
  { background: true, name: 'notes_branchId_checkoutAt_idx' },
);

oneBayshoreWellnessNoteSchema.index(
  {
    cvid: 1,
    employeeName: 1,
    clientDisplayName: 1,
    checkoutAt: -1,
  },
  { background: true, sparse: true, name: 'notes_cvid_employeeName_clientDisplayName_checkoutAt_idx' },
);

oneBayshoreWellnessNoteSchema.index(
  { employeePsId: 1, visitId: 1, tenantId: 1, checkoutAt: -1 },
  {
    unique: true,
    background: true,
    sparse: true,
    name: 'notes_employeePsId_visitId_tenantId_checkoutAt_uniq_idx',
  },
);

export const OBWellnessNoteModel: Model<OBWellnessNoteSchemaType> = model(
  MongoCollection.OneBayshoreWellnessNoteCollection,
  oneBayshoreWellnessNoteSchema,
);
