type ReferralPayloadType = {
  referralName: string;
  referralEmail: string;
  phoneNumber: number;
  city: string;
  jobPosition: string;
  skills: string;
  referredBranches?: string[];
  referredDivisions?: string[];
  referredBy: {
    employeePsId: string;
    displayName?: string;
  };
  createdAt?: Date;
};

export { ReferralPayloadType };
