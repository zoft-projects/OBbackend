import { Schema, model } from 'mongoose';

import { MongoCollection } from '../../enums';

import {
  OBUserReactionSchemaType,
  OBReactionAggregateSchemaType,
  OBImageSchemaType,
  OBAudioSchemaType,
  OBVideoSchemaType,
  OBMultiMediaSchemaType,
  OBCommentsSchemaType,
  OBNewsConnectedUserSchemaType,
  OBAttributesSchemaType,
  OBApprovedBySchemaType,
  OBNewsPostedBySchemaType,
  OBNewsUpdatedBySchemaType,
  OBNewsSchemaType,
} from '../../types';

const OBUserReactionSchema = new Schema<OBUserReactionSchemaType>(
  {
    employeePsId: { type: String, required: true },
    displayName: { type: String },
    reactionType: { type: String, required: true },
  },
  { _id: false },
);

const OBReactionAggregateSchema = new Schema<OBReactionAggregateSchemaType>(
  {
    reactionType: { type: String, required: true },
    totalCount: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const OBImageSchema = new Schema<OBImageSchemaType>(
  {
    url: { type: String, required: true },
    bucketName: { type: String, required: true },
    orientation: { type: String, required: true },
    width: { type: Number },
    height: { type: Number },
  },
  { _id: false },
);

const OBAudioSchema = new Schema<OBAudioSchemaType>(
  {
    url: { type: String, required: true },
    bucketName: { type: String, required: true },
  },
  { _id: false },
);

const OBVideoSchema = new Schema<OBVideoSchemaType>(
  {
    url: { type: String, required: true },
    bucketName: { type: String },
    sourceType: { type: String },
  },
  { _id: false },
);

const OBNewsMultiMediaSchema = new Schema<OBMultiMediaSchemaType>(
  {
    image: { type: OBImageSchema },
    audio: { type: OBAudioSchema },
    video: { type: OBVideoSchema },
  },
  { _id: false },
);

const OBCommentsSchema = new Schema<OBCommentsSchemaType>(
  {
    commentId: { type: String, required: true },
    employeePsId: { type: String, required: true },
    displayName: { type: String, required: true },
    message: { type: String },
    isFlagged: { type: Boolean, default: false },
    isVisible: { type: Boolean, default: true },
  },
  { _id: false },
);

const OBNewsConnectedUserSchema = new Schema<OBNewsConnectedUserSchemaType>(
  {
    employeePsId: { type: String, required: true },
    displayName: { type: String },
    userImageLink: { type: String },
  },
  { _id: false },
);

const OBAttributesSchema = new Schema<OBAttributesSchemaType>(
  {
    connectType: { type: String },
    description: { type: String },
    connectedUser: { type: OBNewsConnectedUserSchema },
  },
  { _id: false },
);

const OBApprovedBySchema = new Schema<OBApprovedBySchemaType>(
  {
    employeePsId: { type: String, required: true },
    displayName: { type: String },
    userImageLink: { type: String },
  },
  { _id: false },
);

const OBNewsPostedBySchema = new Schema<OBNewsPostedBySchemaType>(
  {
    employeePsId: { type: String, required: true },
    displayName: { type: String },
    userImageLink: { type: String },
  },
  { _id: false },
);

const OBNewsUpdatedBySchema = new Schema<OBNewsUpdatedBySchemaType>(
  {
    employeePsId: { type: String, required: true },
    displayName: { type: String },
    userImageLink: { type: String },
  },
  { _id: false },
);

const oneBayshoreNewsSchema = new Schema<OBNewsSchemaType>({
  newsId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  audienceLevel: { type: String, required: true },
  branchIds: { type: [String] },
  provincialCodes: { type: [String] },
  divisionIds: { type: [String] },
  sampleUserReactions: { type: [OBUserReactionSchema] },
  totalReactionAggregate: { type: [OBReactionAggregateSchema], required: true },
  visibility: { type: String, required: true },
  multimedia: { type: OBNewsMultiMediaSchema },
  comments: { type: [OBCommentsSchema] },
  attributes: { type: OBAttributesSchema },
  status: { type: String, required: true },
  approvedBy: { type: OBApprovedBySchema },
  postedBy: { type: OBNewsPostedBySchema, required: true },
  priority: { type: String, required: true },
  expiresAt: { type: Date },
  isDeleted: { type: Boolean, required: true, default: false },
  updatedBy: { type: OBNewsUpdatedBySchema },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
  publishedAt: { type: Date },
});

oneBayshoreNewsSchema.index({ newsId: 1 }, { unique: true, background: true, name: 'newsId_uniq_idx' });
oneBayshoreNewsSchema.index(
  { audienceLevel: 1, status: 1, createdAt: -1 },
  { background: true, name: 'newsAudienceLevel_status_createdAt_idx' },
);

oneBayshoreNewsSchema.index(
  { status: 1, isDeleted: 1, publishedAt: -1, audienceLevel: 1, branchIds: 1 },
  { background: true, name: 'news_status_isDeleted_publishedAt_audienceLevel_branchIds_idx' },
);

export const OBNewsModel = model<OBNewsSchemaType>(
  MongoCollection.OneBayshoreNewsFeedCollection,
  oneBayshoreNewsSchema,
);
