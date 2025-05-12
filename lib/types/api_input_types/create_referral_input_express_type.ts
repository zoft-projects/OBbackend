type HttpPOSTCreateOBReferral = {
  referralName: string;
  referralEmail: string;
  phoneNumber: number;
  city: string;
  jobPosition: string;
  skills: string;
  // TODO: Remove after migration
  referredByPsId?: string;
  referredByName?: string;
  referredByBranchIds?: string[];
  createdAt?: string;
};

export { HttpPOSTCreateOBReferral };
