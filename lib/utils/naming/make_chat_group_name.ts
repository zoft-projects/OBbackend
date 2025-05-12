const makeChatGroupName = (chatGroupName: string, branchId: string, branchName: string): string => {
  const groupName = `${chatGroupName} - ${branchName} (#${branchId})`;

  return groupName;
};

export { makeChatGroupName };
