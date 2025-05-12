import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBChatGroupUserSchemaType, OBChatLastMessageActivityType } from '../../types';

const OBChatLastMessageActivitySchema = new Schema<OBChatLastMessageActivityType>(
  {
    message: { type: String, required: true },
    messageStatus: { type: String, required: true },
    senderId: { type: String, required: true },
    timestamp: { type: Date, required: true },
  },
  { _id: false },
);

const oneBayshoreChatGroupUserSchema = new Schema<OBChatGroupUserSchemaType>({
  groupId: { type: String, required: true },
  quickBloxId: { type: String, required: true },
  groupName: { type: String, required: true },
  groupType: { type: String, required: true },
  branchId: { type: String, required: true },
  employeePsId: { type: String, required: true },
  visibilityLevel: { type: String, required: true },
  isGroupCreator: { type: Boolean, required: true },
  activeStatus: { type: String, required: true },
  isActivated: { type: Boolean, required: true },
  isArchived: { type: Boolean },
  lastMessageActivity: { type: OBChatLastMessageActivitySchema },
  lastSeenAt: { type: Date },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

oneBayshoreChatGroupUserSchema.index(
  { groupId: 1, branchId: 1, quickBloxId: 1, employeePsId: 1 },
  { unique: true, background: true, name: 'chat_groupId_branchId_quickbloxId_employeePsId_uniq_idx' },
);
oneBayshoreChatGroupUserSchema.index(
  { branchId: 1, quickBloxId: 1, employeePsId: 1, activeStatus: 1, groupType: 1, isGroupCreator: 1 },
  { background: true, name: 'branchId_quickbloxId_employeePsId_activeStatus_groupType_isGroupCreator_idx' },
);
oneBayshoreChatGroupUserSchema.index(
  { groupId: 1, branchId: 1, activeStatus: 1 },
  { background: true, name: 'groupId_branchId_activeStatus_idx' },
);

oneBayshoreChatGroupUserSchema.index(
  { activeStatus: 1, branchId: 1, employeePsId: 1, groupType: 1, isGroupCreator: 1 },
  { background: true, name: 'chatGroupUser_activeStatus_branchId_employeePsId_groupType_isGroupCreator_idx' },
);

oneBayshoreChatGroupUserSchema.index(
  { branchId: 1, activeStatus: 1, groupType: 1, isGroupCreator: 1 },
  { background: true, name: 'branchId_activeStatus_groupType_isGroupCreator_idx' },
);

export const OBChatGroupModel: Model<OBChatGroupUserSchemaType> = model(
  MongoCollection.OneBayshoreChatGroupUserCollection,
  oneBayshoreChatGroupUserSchema,
);
