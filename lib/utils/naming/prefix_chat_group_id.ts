const prefixChatGroupId = (id: string): string => {
  const groupId = `CH_GRP${id}`;

  return groupId;
};

const prefixTopicNameForBranch = (branchId: string, uniqId?: string): string => {
  const prefixes = ['topic', branchId];

  if (uniqId) {
    prefixes.push(uniqId);
  }

  return prefixes.join('_');
};

const prefixTopicNameForUser = (psId: string): string => {
  return `topic_emp${psId}`;
};

const prefixTopicNameForGroup = (groupId: string): string => `topic_${groupId}`;

const prefixTopicNameForGroupAndJobLevel = (groupId: string, jobLevel: number): string => {
  return `topic_${groupId}_u${jobLevel}`;
};

export {
  prefixChatGroupId,
  prefixTopicNameForBranch,
  prefixTopicNameForUser,
  prefixTopicNameForGroup,
  prefixTopicNameForGroupAndJobLevel,
};
