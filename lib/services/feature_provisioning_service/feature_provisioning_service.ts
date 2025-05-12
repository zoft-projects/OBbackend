import { TempDataValueEnum, RemoteConfigFileNameEnum, BranchFeaturesProvisionEnum } from '../../enums';
import { logError, logInfo } from '../../log/util';
import { tempDataService } from '../../services';
import { TempDataUpsertOperationType, OBFeatureProvisionSchemaType } from '../../types';
import { areEqual } from '../../utils';
import { getValuesFromRemoteConfig, updateRemoteConfigTemplate } from '../../vendors';

const getFeatureProvisions = async (transactionId: string): Promise<OBFeatureProvisionSchemaType> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getFeatureProvisions initiated`);

    const [featureProvisions] = await tempDataService.getTempDatas(
      transactionId,
      RemoteConfigFileNameEnum.BranchFeatureProvisioning,
      TempDataValueEnum.RemoteConfig,
    );

    if (!featureProvisions) {
      throw new Error('No feature provisions available');
    }

    return featureProvisions.payload as OBFeatureProvisionSchemaType;
  } catch (fetchError) {
    logError(`[${transactionId}] [SERVICE] getFeatureProvisions fetch failed, reason: ${fetchError.message}`);

    throw fetchError;
  }
};

const updateFeatureProvisions = async (
  transactionId: string,
  updatedProvisions: OBFeatureProvisionSchemaType,
): Promise<boolean> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] updateFeatureProvisions initiated`);

    const currentFeatureProvisions = await getFeatureProvisions(transactionId);

    if (currentFeatureProvisions && areEqual(updatedProvisions, currentFeatureProvisions)) {
      return false;
    }

    const mappedData: TempDataUpsertOperationType = {
      primaryIdentifier: RemoteConfigFileNameEnum.BranchFeatureProvisioning,
      valueType: TempDataValueEnum.RemoteConfig,
      payload: updatedProvisions,
    };

    await tempDataService.addTempData(transactionId, mappedData, { shouldOverride: true });

    logInfo(
      `[${transactionId}] [SERVICE] updateFeatureProvisions - Temp collection updated with feature flags successfully`,
    );

    const previousRemoteConfig = (await getValuesFromRemoteConfig(transactionId)) ?? null;

    logInfo(`[${transactionId}] [SERVICE] updateFeatureProvisions - Remote config fetched successfully`);

    const updatedParameter = {
      ...previousRemoteConfig?.parameters,
      branch_feature_provisioning: {
        ...previousRemoteConfig?.parameters?.branch_feature_provisioning,
        defaultValue: {
          value: JSON.stringify(mappedData.payload),
        },
      },
    };

    await updateRemoteConfigTemplate(transactionId, {
      parameters: updatedParameter,
    });

    return true;
  } catch (updateErr) {
    logError(`[${transactionId}] [SERVICE] updateFeatureProvisions FAILED, reason: ${updateErr.message}`);

    throw updateErr;
  }
};

const getProvisionForBranchId = async (
  transactionId: string,
  featureName: BranchFeaturesProvisionEnum,
  branchId: string,
  jobLevel?: number,
): Promise<boolean> => {
  const currentFeatureProvisions = await getFeatureProvisions(transactionId);

  // If branch & jobLevel flag setup
  if (jobLevel && currentFeatureProvisions.branchOverrides[`${branchId}_u${jobLevel}`]) {
    return currentFeatureProvisions.branchOverrides[`${branchId}_u${jobLevel}`][featureName];
  }

  // If branch flag setup
  if (currentFeatureProvisions.branchOverrides[branchId]) {
    return currentFeatureProvisions.branchOverrides[branchId][featureName];
  }

  // Return default value or false as default
  return currentFeatureProvisions.defaultForBranches[featureName] ?? false;
};

export { getFeatureProvisions, updateFeatureProvisions, getProvisionForBranchId };
