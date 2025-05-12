import { Schema, model } from 'mongoose';
import { MongoCollection } from '../../enums';
import {
  OBResourceDocumentSchemaType,
  OBResourceImageSchemaType,
  OBResourceMultiMediaSchemaType,
  OBResourceUserSchemaType,
  OBResourceVideoSchemaType,
  OBResourceSchemaType,
} from '../../types';

const OBResourceUserSchema = new Schema<OBResourceUserSchemaType>(
  {
    employeePsId: { type: String, required: true },
    displayName: { type: String, required: true },
    userImageLink: { type: String },
  },
  { _id: false },
);

const OBResourceImageSchema = new Schema<OBResourceImageSchemaType>(
  {
    url: { type: String, required: true },
    bucketName: { type: String, required: true },
    orientation: { type: String, required: true },
    width: { type: Number },
    height: { type: Number },
  },
  { _id: false },
);

const OBResourceVideoSchema = new Schema<OBResourceVideoSchemaType>(
  {
    url: { type: String, required: true },
    bucketName: { type: String },
    sourceType: { type: String },
  },
  { _id: false },
);

const OBResourceDocumentSchema = new Schema<OBResourceDocumentSchemaType>(
  {
    url: { type: String, required: true },
    bucketName: { type: String },
    sourceType: { type: String },
  },
  { _id: false },
);

const OBResourceMultiMediaSchema = new Schema<OBResourceMultiMediaSchemaType>(
  {
    image: { type: OBResourceImageSchema },
    video: { type: OBResourceVideoSchema },
    document: { type: OBResourceDocumentSchema },
    mediaType: { type: String, required: true },
  },
  { _id: false },
);

const OBResourceSchema = new Schema<OBResourceSchemaType>({
  resourceId: { type: String, required: true },
  resourceName: { type: String, required: true },
  multimedia: { type: OBResourceMultiMediaSchema, required: true },
  audienceLevel: { type: String, required: true },
  userPsId: { type: String },
  branchIds: { type: [String] },
  provincialCodes: { type: [String] },
  divisionIds: { type: [String] },
  isDeleted: { type: Boolean, required: true, default: false },
  createdBy: { type: OBResourceUserSchema },
  updatedBy: { type: OBResourceUserSchema },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

OBResourceSchema.index({ resourceId: 1 }, { unique: true, background: true, name: 'resourceId_uniq_idx' });
OBResourceSchema.index(
  { audienceLevel: 1, createdAt: -1 },
  { background: true, name: 'resourceAudienceLevel_createdAt_idx' },
);

export const OBResourceModel = model<OBResourceSchemaType>(
  MongoCollection.OneBayshoreResourcesCollection,
  OBResourceSchema,
);
