import { NextFunction } from 'connect';
import express from 'express';

import { UserStatusEnum } from '../../enums';
import { logError } from '../../log/util';
import { userService, locationService } from '../../services';
import { OneBayshoreUserIdentity } from '../../types';
import { getUniqueStringsFromList, userPsId } from '../../utils';

const identityMiddleware = async (req: express.Request, _res: express.Response, next: NextFunction): Promise<void> => {
  const transactionId = req.txId;

  const { employeePsId, primaryEmail } = req.employeePingIdentity;

  try {
    const currentUserPsId = userPsId(employeePsId, primaryEmail);

    // TODO call employee microservice as well for additional information
    const [obUser, procuraUserDetails, psUserDetails] = await Promise.all([
      userService.getObUsersByPsId(transactionId, currentUserPsId),
      userService.getMultipleProcuraDetailFromEmployeeService(transactionId, currentUserPsId),
      userService.getEmployeePSFromEmployeeService(transactionId, currentUserPsId),
    ]);

    if (!obUser) {
      throw new Error('User not registered in the system');
    }

    const userIdentity: Partial<OneBayshoreUserIdentity> = {
      displayName: obUser.displayName,
      profileImgLink: obUser.tempProfile?.tempProfileImgUrl,
      obUserPsId: currentUserPsId,
      hasAccess: obUser.activeStatus.toUpperCase() === UserStatusEnum.Active.toUpperCase(),
      accessLvl: obUser.obAccess.level,
      email: obUser.workEmail,
      jobId: obUser.job.jobId,
      jobLvl: obUser.job.level,
      branchIds: [],
      assumedBranchIds: obUser.branchAccess.overriddenBranchIds ?? [],
      divisionIds: [],
      deptNames: [],
      provinceCodes: [],
      systemIdentifiers: [],
      deviceTokenValues: (obUser.deviceTokens ?? []).map((tokenDetail) => tokenDetail.deviceId),
    };

    const branchesDetails = await Promise.all(
      getUniqueStringsFromList(obUser.branchAccess.selectedBranchIds, obUser.branchAccess.overriddenBranchIds).map(
        (branchId: string) => locationService.getBranchDetailsById(transactionId, branchId),
      ),
    );

    branchesDetails.forEach((branchDetail) => {
      userIdentity.branchIds.push(branchDetail.branchId);
      userIdentity.divisionIds = [...new Set([...userIdentity.divisionIds, ...branchDetail.divisionIds])];

      if (branchDetail.departmentNames?.length > 0) {
        userIdentity.deptNames = [...userIdentity.deptNames, ...branchDetail.departmentNames];
      }

      userIdentity.provinceCodes = [...new Set([...userIdentity.provinceCodes, branchDetail.province])];
    });

    if (Array.isArray(procuraUserDetails) && procuraUserDetails.length > 0) {
      procuraUserDetails.forEach(({ employeeId, tenantId, systemType, designation }) => {
        userIdentity.systemIdentifiers.push({
          systemName: systemType,
          empSystemId: employeeId,
          tenantId,
          designation,
        });
      });
    }

    (psUserDetails?.employeeSystems || []).map((system) => {
      if (system.systemType === 'calcom') {
        userIdentity.systemIdentifiers.push({
          systemName: system.systemType,
          empSystemId: system.employeeSystemId,
          tenantId: system.tenantId,
        });
      }
    });

    req.obUserIdentity = userIdentity as OneBayshoreUserIdentity;

    next();
  } catch (userIdentityErr) {
    logError(
      `[${transactionId}] [MIDDLEWARE] Identity - unable to identify ${userPsId(employeePsId, primaryEmail)}, reason: ${
        userIdentityErr.message
      }`,
    );
    next(
      new Error(
        'Sorry, it does seem like your profile is not setup. Please contact your branch or raise service now ticket for us to onboard you into our system.',
      ),
    );
  }
};

export { identityMiddleware };
