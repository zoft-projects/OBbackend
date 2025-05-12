type OBDivisionOperationType = {
  divisionName: string;
  divisionId: string;
  description?: string;
  legacyId?: string;
};

type OBBranchDivisionUpsertOperationType = {
  branchName: string;
  branchId: string;
  description?: string;
  departmentNames?: string[];
  city: string;
  province: string;
  postalCode?: string;
  address?: string;
  locationId?: string;
  divisions: OBDivisionOperationType[];
  legacyId?: string;
  branchPhone?: string;
  branchEmail?: string;
  availStartTime?: string;
  availEndTime?: string;
  tollFreePhone?: string;
  branchManagerPsIds?: string[];
};

type OBBranchDetailedOperationType = {
  branchId: string;
  branchName: string;
  legacyBranchCMSId?: string;
  city?: string;
  province?: string;
  locationId?: string;
  divisionIds: string[];
  departmentNames?: string[];
  divisions: {
    divisionId: string;
    divisionName: string;
    legacyDivisionCMSId?: string;
  }[];
  branchPhone?: string;
  branchEmail?: string;
  availStartTime?: string;
  availEndTime?: string;
  address?: string;
  tollFreePhone?: string;
  branchManagerPsIds?: string[];
};

export { OBBranchDivisionUpsertOperationType, OBBranchDetailedOperationType };
