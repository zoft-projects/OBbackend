type HttpPOSTCreateOBConcern = {
  concern: string;
  canIncludeIdentity: boolean;
  // TODO: Remove after migration
  concernedUserId?: string;
  concernedUserEmail?: string;
  concernedUserName?: string;
  createdAt?: string;
};

export { HttpPOSTCreateOBConcern };
