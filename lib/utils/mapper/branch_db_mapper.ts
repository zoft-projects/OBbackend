import {
  HttpPOSTCreateOBBranch,
  OBBranchDivisionUpsertOperationType,
  OBBranchSchemaType,
  OBDivisionSchemaType,
} from '../../types';

const mapBranchApiRequestToOperation = (
  inputRequest: HttpPOSTCreateOBBranch,
): Partial<OBBranchDivisionUpsertOperationType> => {
  const mappedPayload: Partial<OBBranchDivisionUpsertOperationType> = {
    branchId: inputRequest.branchId,
  };

  if (!inputRequest.branchId) {
    return null;
  }

  if (inputRequest.branchName) {
    mappedPayload.branchName = inputRequest.branchName;
  }

  if (inputRequest.city) {
    mappedPayload.city = inputRequest.city;
  }

  if (inputRequest?.address) {
    mappedPayload.address = inputRequest?.address;
  }

  if (inputRequest.province) {
    mappedPayload.province = inputRequest.province;
  }

  if (inputRequest.legacyId) {
    mappedPayload.legacyId = inputRequest.legacyId;
  }

  if (inputRequest.locationId) {
    mappedPayload.locationId = inputRequest.locationId;
  }

  if (inputRequest.divisions) {
    mappedPayload.divisions = inputRequest.divisions;
  }

  if (inputRequest.departmentNames) {
    mappedPayload.departmentNames = inputRequest.departmentNames;
  }

  if (inputRequest.branchPhone) {
    mappedPayload.branchPhone = inputRequest.branchPhone;
  }

  if (inputRequest.branchEmail) {
    mappedPayload.branchEmail = inputRequest.branchEmail;
  }

  if (inputRequest.availStartTime && inputRequest.availEndTime) {
    mappedPayload.availStartTime = inputRequest.availStartTime;
    mappedPayload.availEndTime = inputRequest.availEndTime;
  }

  if (inputRequest.tollFreePhone) {
    mappedPayload.tollFreePhone = inputRequest.tollFreePhone;
  }

  if (inputRequest.branchManagerPsIds) {
    mappedPayload.branchManagerPsIds = inputRequest.branchManagerPsIds;
  }

  return mappedPayload;
};

const mapBranchOperationTypeToDbRecord = (
  inputData: Partial<OBBranchDivisionUpsertOperationType>,
): [Partial<OBBranchSchemaType>, Partial<OBDivisionSchemaType>[]] => {
  const mappedBranch: Partial<OBBranchSchemaType> = {};
  const mappedDivisions: Partial<OBDivisionSchemaType>[] = [];

  mappedBranch.branchId = inputData.branchId;

  if (inputData.branchName) {
    mappedBranch.branchName = inputData.branchName;
  }

  if (inputData.city) {
    mappedBranch.city = inputData.city;
  }

  if (inputData.province) {
    mappedBranch.province = inputData.province;
  }

  if (inputData.postalCode) {
    mappedBranch.postalCode = inputData.postalCode;
  }

  if (inputData.address) {
    mappedBranch.address = inputData.address;
  }

  if (inputData.description) {
    mappedBranch.description = inputData.description;
  }

  if (inputData.legacyId) {
    mappedBranch.legacyId = inputData.legacyId;
  }

  if (inputData.locationId) {
    mappedBranch.locationId = inputData.locationId;
  }

  if (inputData.departmentNames) {
    mappedBranch.departmentNames = inputData.departmentNames;
  }

  inputData.divisions?.forEach((inputDivision) => {
    const mappedDivision: Partial<OBDivisionSchemaType> = {};

    if (inputDivision.divisionId) {
      mappedDivision.divisionId = inputDivision.divisionId;

      if (!mappedBranch.divisionIds) {
        mappedBranch.divisionIds = [];
      }
      mappedBranch.divisionIds.push(inputDivision.divisionId);
    }
    if (inputDivision.divisionName) {
      mappedDivision.divisionName = inputDivision.divisionName;
    }
    if (inputDivision.legacyId) {
      mappedDivision.legacyId = inputDivision.legacyId;
    }
    if (inputDivision.description) {
      mappedDivision.description = inputDivision.description;
    }

    mappedDivisions.push(mappedDivision);
  });

  if (inputData.branchPhone) {
    mappedBranch.branchPhone = inputData.branchPhone;
  }

  if (inputData.branchPhone) {
    mappedBranch.branchEmail = inputData.branchEmail;
  }

  if (inputData.availStartTime && inputData.availEndTime) {
    mappedBranch.availStartTime = inputData.availStartTime;
    mappedBranch.availEndTime = inputData.availEndTime;
  }

  if (inputData.tollFreePhone) {
    mappedBranch.tollFreePhone = inputData.tollFreePhone;
  }

  if (inputData.branchManagerPsIds) {
    mappedBranch.branchManagerPsIds = inputData.branchManagerPsIds;
  }

  return [mappedBranch, mappedDivisions];
};

export { mapBranchApiRequestToOperation, mapBranchOperationTypeToDbRecord };
