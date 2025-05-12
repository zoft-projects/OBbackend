type ConcernPayloadType = {
  concern: string;
  concernedBy: {
    employeePsId: string;
    displayName?: string;
  };
  createdAt?: Date;
};

export { ConcernPayloadType };
