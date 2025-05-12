import { Schema, model } from 'mongoose';

import { MongoCollection as MongoCollectionEnum } from '../../enums';
import { OBNewsInteractionSchemaType } from '../../types';

const oneBayshoreNewsInteractionSchema = new Schema<OBNewsInteractionSchemaType>({
  newsId: { type: String, required: true },
  category: { type: String, required: true },
  reactedUserPsId: { type: String, required: true },
  title: { type: String },
  userDisplayName: { type: String },
  userImageLink: { type: String },
  reactionType: { type: String, required: true },
  reactedAt: { type: Date, required: true, default: Date.now },
});

oneBayshoreNewsInteractionSchema.index(
  { newsId: 1, reactedUserPsId: 1, reactedAt: -1 },
  { background: true, name: 'newsId_psId_reactedAt_idx' },
);

export const OBNewsInteractionModel = model<OBNewsInteractionSchemaType>(
  MongoCollectionEnum.OneBayshoreNewsInteractionCollection,
  oneBayshoreNewsInteractionSchema,
);
