import { UserLevelEnum } from '../../enums';

export const mapAccessLevelToName = (level: number): UserLevelEnum => {
  if (level === 9) {
    return UserLevelEnum.SUPER_ADMIN;
  }
  if (level >= 7) {
    return UserLevelEnum.ADMIN;
  }
  if (level === 6) {
    return UserLevelEnum.CONTROLLED_ADMIN;
  }
  if (level >= 2) {
    return UserLevelEnum.BRANCH_ADMIN;
  }

  return UserLevelEnum.FIELD_STAFF;
};

export const mapAccessNameToBaseLevel = (accessName: UserLevelEnum): number => {
  if (accessName === UserLevelEnum.SUPER_ADMIN) {
    return 9;
  }
  if (accessName === UserLevelEnum.ADMIN) {
    return 7;
  }
  if (accessName === UserLevelEnum.CONTROLLED_ADMIN) {
    return 6;
  }
  if (accessName === UserLevelEnum.BRANCH_ADMIN) {
    return 2;
  }

  return 1;
};

export const mapAccessNamesFromLevel = (accessName: UserLevelEnum): number[] => {
  let matchingLevels: number[] = [];

  if (accessName === UserLevelEnum.FIELD_STAFF) {
    matchingLevels = [1];
  }

  if (accessName === UserLevelEnum.BRANCH_ADMIN) {
    matchingLevels = [2, 3, 4, 5];
  }

  if (accessName === UserLevelEnum.CONTROLLED_ADMIN) {
    matchingLevels = [6];
  }

  if (accessName === UserLevelEnum.ADMIN) {
    matchingLevels = [7, 8];
  }

  if (accessName === UserLevelEnum.SUPER_ADMIN) {
    matchingLevels = [9];
  }

  return matchingLevels;
};
