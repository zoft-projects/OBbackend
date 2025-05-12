import { VendorExternalEnum } from '../../enums';
import { OBUserSchemaType, QuickBloxUserType, QuickbloxUserUpsertOperationType } from '../../types';
import { getEffectiveBranchIds } from '../../utils';

const compareUserDataChange = (
  userDataOB: OBUserSchemaType,
  quickbloxUserData: QuickBloxUserType,
): { canUpdate: boolean; updateFields: Partial<QuickbloxUserUpsertOperationType> } => {
  let canUpdate = false;

  const quickBloxVendor = userDataOB.vendorSystems.find(
    (system) => system.vendorId === VendorExternalEnum.Quickblox.toLowerCase(),
  );

  const [quickBloxId] = quickBloxVendor.vendorValue.split('|');

  const toUpdateFields: { [key: string]: any } = { quickBloxId };

  if (userDataOB.workEmail !== quickbloxUserData?.email) {
    canUpdate = true;
  }

  if (userDataOB.displayName !== quickbloxUserData?.full_name) {
    canUpdate = true;
  }

  toUpdateFields.email = userDataOB.workEmail;
  toUpdateFields.displayName = userDataOB.displayName;

  const quickbloxCustomData = quickbloxUserData ? JSON.parse(quickbloxUserData?.custom_data) : null;

  const branchIdMap = new Set(
    getEffectiveBranchIds(userDataOB.branchAccess.overriddenBranchIds, userDataOB.branchAccess.selectedBranchIds),
  );

  if (!quickbloxCustomData) {
    canUpdate = true;
  }

  if (!quickbloxCustomData?.branchIds) {
    canUpdate = true;
  } else if (
    quickbloxCustomData &&
    Array.isArray(quickbloxCustomData.branchIds) &&
    quickbloxCustomData.branchIds.length
  ) {
    branchIdMap.forEach((id) => {
      if (!quickbloxCustomData.branchIds.includes(id)) {
        canUpdate = true;
      }
    });

    quickbloxCustomData.branchIds.forEach((id: string) => {
      if (!branchIdMap.has(id)) {
        canUpdate = true;
      }
    });
  }

  if (
    quickbloxCustomData &&
    (userDataOB.tempProfile?.tempProfileImgUrl !== quickbloxCustomData.profileImage ||
      userDataOB.job.jobId !== quickbloxCustomData.jobId ||
      userDataOB.job.level !== quickbloxCustomData.jobLevel ||
      userDataOB.obAccess.level !== quickbloxCustomData.accessLevel)
  ) {
    canUpdate = true;
  }

  toUpdateFields.customData = {
    psId: userDataOB.employeePsId,
    profileImage: userDataOB.tempProfile?.tempProfileImgUrl,
    branchIds: getEffectiveBranchIds(
      userDataOB.branchAccess.overriddenBranchIds,
      userDataOB.branchAccess.selectedBranchIds,
    ),
    jobId: userDataOB.job.jobId,
    jobCode: userDataOB.job.code,
    jobLevel: userDataOB.job.level,
    accessLevel: userDataOB.obAccess.level,
  };

  if (quickbloxCustomData && quickbloxCustomData.lastAccessedAt) {
    toUpdateFields.customData.lastAccessedAt = quickbloxCustomData.lastAccessedAt;
  }

  return {
    canUpdate,
    updateFields: toUpdateFields,
  };
};

export { compareUserDataChange };
