type HttpPOSTCreateOBBranch = {
  branchId: string;
  branchName: string;
  city: string;
  address?: string;
  province: string;
  legacyId?: string;
  locationId?: string;
  departmentNames?: string[];
  divisions: {
    divisionId: string;
    divisionName: string;
    legacyId?: string;
  }[];
  branchPhone?: string;
  branchEmail?: string;
  availStartTime?: string;
  availEndTime?: string;
  tollFreePhone?: string;
  branchManagerPsIds?: string[];
};

export { HttpPOSTCreateOBBranch };
