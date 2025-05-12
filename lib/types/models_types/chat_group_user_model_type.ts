import { ActiveStateEnum, ChatGroupEnum } from '../../enums';

enum GroupVisibilityLevelEnum {
  SELF = 'SELF',
  ADMIN = 'ADMIN',
  ALL = 'ALL',
}

enum MessageStatusEnum {
  Opened = 'Opened',
  Responded = 'Responded',
}

type OBChatLastMessageActivityType = {
  message: string;
  messageStatus: MessageStatusEnum;
  senderId: string;
  timestamp: Date;
};

type OBChatGroupUserSchemaType = {
  id?: string;
  groupId: string;
  quickBloxId: string; // User Quickblox Id
  groupName: string;
  groupType: ChatGroupEnum;
  branchId: string;
  employeePsId: string;
  visibilityLevel: GroupVisibilityLevelEnum;
  isGroupCreator: boolean;
  activeStatus: ActiveStateEnum;
  isArchived?: boolean;
  lastMessageActivity?: OBChatLastMessageActivityType;
  isActivated: boolean;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
};

export { OBChatGroupUserSchemaType, GroupVisibilityLevelEnum, OBChatLastMessageActivityType };
