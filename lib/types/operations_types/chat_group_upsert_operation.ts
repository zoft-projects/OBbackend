import { ChatGroupEnum, QBCustomClassNameEnum } from '../../enums';

type ChatUpsertOperationType = {
  groupName: string;
  className: QBCustomClassNameEnum;
  branchId: string;
  branchName: string;
  groupType: ChatGroupEnum;
  occupantIds: string[];
  isAuto: boolean;
  primaryUserPsId?: string;
  isArchived?: boolean;
};

export { ChatUpsertOperationType };
