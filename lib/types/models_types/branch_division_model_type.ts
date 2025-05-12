type OBBranchSchemaType = {
  id?: string;
  branchName: string;
  branchId: string;
  description?: string;
  city: string;
  province: string;
  postalCode?: string;
  address?: string;
  locationId?: string;
  divisionIds: string[];
  departmentNames?: string[];
  legacyId?: string;
  branchPhone?: string;
  branchEmail?: string;
  availStartTime?: string;
  availEndTime?: string;
  tollFreePhone?: string;
  branchManagerPsIds?: string[];
  createdAt: Date;
  updatedAt: Date;
};

type OBDivisionSchemaType = {
  id?: string;
  divisionName: string;
  divisionId: string;
  description?: string;
  legacyId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export { OBDivisionSchemaType, OBBranchSchemaType };
