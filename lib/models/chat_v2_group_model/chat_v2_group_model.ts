import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBChatV2GroupSchemaType, OBChatV2LastMessageActivityType } from '../../types';

const GroupImageSchema = new Schema(
  {
    bucketName: { type: String },
    uri: { type: String },
  },
  { _id: false },
);

const AccessControlMetaSchema = new Schema(
  {
    maxUsersAllowed: { type: Number, required: true },
    bidirectional: { type: Boolean, required: true },
    attachmentsAllowed: { type: Boolean, required: true },
    richTextSupported: { type: Boolean, required: true },
    captureActivities: { type: Boolean, required: true },
    notificationsPaused: { type: Boolean, required: true },
    notificationsPausedUntil: { type: Date },
    chatOpenHour: { type: Number, required: true },
    chatCloseHour: { type: Number, required: true },
    availableOnWeekends: { type: Boolean, required: true },
  },
  { _id: false },
);

const MetricsMetaSchema = new Schema(
  {
    totalActiveAdminCount: { type: Number, required: true },
    totalUserCount: { type: Number, required: true },
    totalActiveUserCount: { type: Number, required: true },
  },
  { _id: false },
);

const LastMessageActivitySchema = new Schema<OBChatV2LastMessageActivityType>(
  {
    messageId: { type: String },
    message: { type: String, required: true },
    messageStatus: { type: String, required: true },
    timestamp: { type: Date, required: true },
  },
  { _id: false },
);

const OBChatV2GroupSchema = new Schema<OBChatV2GroupSchemaType>({
  groupId: { type: String, required: true },
  vendorGroupId: { type: String, required: true },
  groupName: { type: String, required: true },
  groupImage: { type: GroupImageSchema },
  groupType: {
    type: String,
    required: true,
  },
  groupCategory: { type: String },
  branchId: { type: String, required: true },
  intendedForPsId: { type: String },
  activeStatus: {
    type: String,
    required: true,
  },
  activeUntil: { type: Date },
  accessControlMeta: { type: AccessControlMetaSchema, required: true },
  metricsMeta: { type: MetricsMetaSchema, required: true },
  lastMessageActivity: { type: LastMessageActivitySchema },
  createdBy: { type: String, required: true },
  createdByPsId: { type: String },
  updatedByPsId: { type: String },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

OBChatV2GroupSchema.index({ groupId: 1 }, { unique: true, background: true, name: 'chat-v2-groups_groupId_uniq_idx' });

OBChatV2GroupSchema.index(
  {
    groupType: 1,
    branchId: 1,
    activeStatus: 1,
    'lastMessageActivity.timestamp': 1,
    updatedAt: -1,
  },
  {
    background: true,
    sparse: true,
    name: 'chat-v2-groups_groupType_branchId_activeStatus_lastMsgActivityTimestamp_updatedAt_desc_idx',
  },
);

OBChatV2GroupSchema.index(
  {
    intendedForPsId: 1,
    branchId: 1,
    groupType: 1,
    activeStatus: 1,
    updatedAt: -1,
  },
  {
    background: true,
    sparse: true,
    name: 'chat-v2-groups_intendedForPsId_branchId_groupType_activeStatus_updatedAt_desc_idx',
  },
);

export const OBChatV2GroupModel: Model<OBChatV2GroupSchemaType> = model(
  MongoCollection.OneBayshoreChatV2GroupCollection,
  OBChatV2GroupSchema,
);
