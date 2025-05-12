import { OBAnonymizedInfoSchemaType, ReferralPayloadType, OBBranchDetailedOperationType } from '../../types';

const mapAnonymizedInfoToReferralPayload = (
  anonymizedInfo: OBAnonymizedInfoSchemaType,
  dependencies?: {
    branchDivisions?: OBBranchDetailedOperationType[];
  },
): ReferralPayloadType => {
  const [referredByPsId] = anonymizedInfo.identifier.split('_');
  const [referralName, referralEmail] = anonymizedInfo.infoValue.split('|');

  const mappedReferral: Partial<ReferralPayloadType> = {
    referralName,
    referralEmail,
    referredBy: {
      employeePsId: referredByPsId,
    },
    createdAt: new Date(anonymizedInfo.createdAt),
  };

  const branchDivisionLookup = new Map<string, OBBranchDetailedOperationType>();

  if (dependencies?.branchDivisions) {
    dependencies.branchDivisions.forEach((branchDivision) => {
      branchDivisionLookup.set(branchDivision.branchId, branchDivision);
    });
  }

  if (anonymizedInfo.payload) {
    if (anonymizedInfo.payload.phoneNumber) {
      mappedReferral.phoneNumber = anonymizedInfo.payload.phoneNumber as number;
    }

    if (anonymizedInfo.payload.city) {
      mappedReferral.city = anonymizedInfo.payload.city as string;
    }

    if (anonymizedInfo.payload.jobPosition) {
      mappedReferral.jobPosition = anonymizedInfo.payload.jobPosition as string;
    }

    if (anonymizedInfo.payload.skills) {
      mappedReferral.skills = anonymizedInfo.payload.skills as string;
    }

    if (
      Array.isArray(anonymizedInfo.payload.referredByBranchIds) &&
      anonymizedInfo.payload.referredByBranchIds.length > 0
    ) {
      mappedReferral.referredDivisions = [];
      mappedReferral.referredBranches = [];
      (anonymizedInfo.payload.referredByBranchIds as string[]).forEach((branchId) => {
        const matchingBranchDivision = branchDivisionLookup.get(branchId);

        if (matchingBranchDivision) {
          mappedReferral.referredBranches.push(matchingBranchDivision.branchName);
          matchingBranchDivision.divisions.forEach((division) => {
            mappedReferral.referredDivisions.push(division.divisionName);
          });
        }
      });
    }

    if (anonymizedInfo.payload.referredByName) {
      mappedReferral.referredBy = {
        ...mappedReferral.referredBy,
        displayName: anonymizedInfo.payload.referredByName as string,
      };
    }
  }

  return mappedReferral as ReferralPayloadType;
};

export { mapAnonymizedInfoToReferralPayload };
