import { Schema, model } from 'mongoose';
import { MongoCollection as MongoCollectionEnum } from '../../enums';
import {
  OBSupportTicketSchemaType,
  OBResolutionNotesSchemaType,
  OBSupportTicketMultiMediaSchemaType,
  OBSupportTicketImageSchemaType,
  OBSupportTicketVideoSchemaType,
  OBSupportTicketUserSchemaType,
} from '../../types';

const OBSupportTicketUserSchema = new Schema<OBSupportTicketUserSchemaType>(
  {
    employeePsId: { type: String, required: true },
    employeeEmail: { type: String, required: false },
    displayName: { type: String, required: false },
  },
  { _id: false },
);

const OBSupportTicketImageSchema = new Schema<OBSupportTicketImageSchemaType>(
  {
    url: { type: String, required: true },
    bucketName: { type: String },
    orientation: { type: String },
    width: { type: Number },
    height: { type: Number },
  },
  { _id: false },
);

const OBSupportTicketVideoSchema = new Schema<OBSupportTicketVideoSchemaType>(
  {
    url: { type: String, required: true },
    bucketName: { type: String },
    sourceType: { type: String },
  },
  { _id: false },
);

const OBSupportTicketMultiMediaSchema = new Schema<OBSupportTicketMultiMediaSchemaType>(
  {
    image: { type: OBSupportTicketImageSchema },
    video: { type: OBSupportTicketVideoSchema },
    mediaType: { type: String, required: true },
  },
  { _id: false },
);

const OBResolutionNotesSchema = new Schema<OBResolutionNotesSchemaType>(
  {
    resolvedBy: { type: String, required: true },
    date: { type: Date, required: true },
    note: { type: String, required: true },
  },
  { _id: false },
);

const SupportTicketSchema = new Schema<OBSupportTicketSchemaType>({
  ticketRefId: { type: String, required: true },
  title: { type: String, required: true },
  summary: { type: String },
  ticketType: { type: String, required: true },
  priority: { type: String, required: true },
  tags: { type: [String] },
  categories: { type: [String] },
  assignedPsIds: { type: [String] },
  assignedBranchIds: { type: [String] },
  ticketStatus: { type: String, required: true },
  initiatorType: { type: String, required: true },
  initiatedUser: { type: OBSupportTicketUserSchema },
  stepsToReproduce: { type: String },
  multiMedias: { type: [OBSupportTicketMultiMediaSchema] },
  resolutionNote: { type: OBResolutionNotesSchema },
  updatedBy: { type: String },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

SupportTicketSchema.index(
  { ticketRefId: 1 },
  { unique: true, background: true, name: 'supportTicket_ticketRefId_uniq_idx' },
);
SupportTicketSchema.index(
  { assignedBranchIds: 1, ticketStatus: 1, ticketType: 1, priority: 1, createdAt: -1, initiatorType: 1 },
  {
    sparse: true,
    background: true,
    name: 'supportTicket_assignedBranchIds_ticketStatus_ticketType_priority_createdAt_idx',
  },
);

export const OBSupportTicketModel = model<OBSupportTicketSchemaType>(
  MongoCollectionEnum.OneBayshoreSupportTicketsCollection,
  SupportTicketSchema,
);
