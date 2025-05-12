type BranchesPayloadType = {
  legacyBranchCMSId: string;
  branchId: string;
  branchName: string;
  city: string;
  province: string;
  departmentNames: string[];
  locationId?: string | null;
  divisionIds: string[];
  divisions: {
    divisionId: string;
    divisionName: string;
    legacyDivisionCMSId?: string | null;
  }[];
};

export { BranchesPayloadType };
