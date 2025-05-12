import config from 'config';
import { MixpanelVendorType } from '../../types';
import { getSecret } from '../aws/secret_manager';

const {
  secretKeyName: mixpanelSecretKeyName,
}: {
  secretKeyName: string;
} = config.get('Services.mixpanel');

const getMixpanelConfig = async (): Promise<MixpanelVendorType> => {
  const mixpanelToken = (await getSecret(mixpanelSecretKeyName)) ?? '';

  return {
    mixpanelToken,
  };
};

export { getMixpanelConfig };
