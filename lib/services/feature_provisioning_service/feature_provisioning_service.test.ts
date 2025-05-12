import { featureProvisioningService } from '../';
import { getFeatureProvisions } from '../../../testUtils';
import { BranchFeaturesProvisionEnum, RemoteConfigFileNameEnum, TempDataValueEnum, UserLevelEnum } from '../../enums';
import * as Model from '../../models';
import { OBFeatureProvisionSchemaType } from '../../types';
import { mapAccessNameToBaseLevel } from '../../utils';

describe('Unit test for featureProvisioningService', () => {
  const queryFeatureProvisions = async (): Promise<OBFeatureProvisionSchemaType | null> =>
    (
      await Model.OBTempDataModel.findOne({
        primaryIdentifier: RemoteConfigFileNameEnum.BranchFeatureProvisioning,
        valueType: TempDataValueEnum.RemoteConfig,
      })
    )?.payload as OBFeatureProvisionSchemaType;

  it('should return provisions using getFeatureProvisions()', async () => {
    const mockProvisions = await getFeatureProvisions();

    const featureProvisions = await featureProvisioningService.getFeatureProvisions('mock-txId');

    expect(featureProvisions).toStrictEqual(mockProvisions);
  });

  it('should update provisions using updateFeatureProvisions()', async () => {
    const currentProvisions = await getFeatureProvisions({
      branchOverrides: {
        '99': {
          [BranchFeaturesProvisionEnum.IdBadge]: true,
        },
      },
    });

    const provisionBeforeChanges = await queryFeatureProvisions();

    currentProvisions.branchOverrides['99'] = {
      [BranchFeaturesProvisionEnum.IdBadge]: false,
    };

    await expect(
      featureProvisioningService.updateFeatureProvisions('mock-txId', currentProvisions),
    ).resolves.toBeTruthy();

    const provisionsAfterChange = await queryFeatureProvisions();

    expect(provisionBeforeChanges).toBeTruthy();
    expect(provisionBeforeChanges!.branchOverrides['99'][BranchFeaturesProvisionEnum.IdBadge]).toBeTruthy();
    expect(provisionsAfterChange!.branchOverrides['99'][BranchFeaturesProvisionEnum.IdBadge]).toBeFalsy();
  });

  it('should return feature provision for branch id using getProvisionForBranchId()', async () => {
    await getFeatureProvisions({
      branchOverrides: {
        '99': {
          [BranchFeaturesProvisionEnum.IdBadge]: false,
        },
        '100': {
          [BranchFeaturesProvisionEnum.IdBadge]: true,
        },
      },
    });

    await expect(
      featureProvisioningService.getProvisionForBranchId('mock-txId', BranchFeaturesProvisionEnum.IdBadge, '99'),
    ).resolves.toEqual(false);

    await expect(
      featureProvisioningService.getProvisionForBranchId('mock-txId', BranchFeaturesProvisionEnum.IdBadge, '100'),
    ).resolves.toEqual(true);
  });

  it('should return feature provision as false for non-existing branch id using getProvisionForBranchId()', async () => {
    await getFeatureProvisions({
      defaultForBranches: {
        [BranchFeaturesProvisionEnum.IdBadge]: true,
      },
    });

    await expect(
      featureProvisioningService.getProvisionForBranchId('mock-txId', BranchFeaturesProvisionEnum.IdBadge, '101'),
    ).resolves.toEqual(true);

    await expect(
      featureProvisioningService.getProvisionForBranchId('mock-txId', BranchFeaturesProvisionEnum.IdBadge, '300'),
    ).resolves.toEqual(true);
  });

  it('should return feature provision for branch id and job level using getProvisionForBranchId()', async () => {
    await getFeatureProvisions({
      branchOverrides: {
        '99': {
          [BranchFeaturesProvisionEnum.IdBadge]: false,
        },
        '99_u2': {
          [BranchFeaturesProvisionEnum.IdBadge]: true,
        },
      },
    });

    await expect(
      featureProvisioningService.getProvisionForBranchId('mock-txId', BranchFeaturesProvisionEnum.IdBadge, '99'),
    ).resolves.toEqual(false);

    await expect(
      featureProvisioningService.getProvisionForBranchId(
        'mock-txId',
        BranchFeaturesProvisionEnum.IdBadge,
        '99',
        mapAccessNameToBaseLevel(UserLevelEnum.BRANCH_ADMIN),
      ),
    ).resolves.toEqual(true);
  });
});
