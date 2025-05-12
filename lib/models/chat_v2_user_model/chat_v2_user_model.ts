import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBChatV2UserImageType, OBChatV2UserSchemaType } from '../../types';

const UserImageSchema = new Schema<OBChatV2UserImageType>(
  {
    bucketName: { type: String, required: false },
    uri: { type: String, required: false },
  },
  { _id: false },
);

const OBChatV2UserSchema = new Schema<OBChatV2UserSchemaType>({
  employeePsId: { type: String, required: true },
  vendorUserId: { type: String, required: true }, // vendorUserId stores the communicationUserId from ACS.
  groupId: { type: String, required: true },
  vendorGroupId: { type: String, required: true }, // vendorGroupId stores the communicationThreadId from ACS.
  branchId: { type: String, required: true },
  employeeName: { type: String, required: true },
  employeeImage: { type: UserImageSchema },
  accessMode: { type: String, required: true },
  activeStatus: { type: String, required: true },
  muteNotifications: { type: Boolean, required: true, default: false },
  muteNotificationsUntil: { type: Date },
  lastSeenAt: { type: Date },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

OBChatV2UserSchema.index(
  { employeePsId: 1, groupId: 1 },
  { unique: true, background: true, name: 'chat_v2_employeePsId_groupId_uniq_idx' },
);

OBChatV2UserSchema.index(
  { groupId: 1, branchId: 1, activeStatus: 1 },
  { background: true, name: 'chat_v2_groupId_branchId_activeStatus_idx' },
);

OBChatV2UserSchema.index(
  { employeePsId: 1, branchId: 1, activeStatus: 1, updatedAt: -1 },
  { background: true, name: 'chat_v2_employeePsId_branchId_activeStatus_updatedAt_idx' },
);

export const OBChatV2UserModel: Model<OBChatV2UserSchemaType> = model(
  MongoCollection.OneBayshoreChatV2UserCollection,
  OBChatV2UserSchema,
);
