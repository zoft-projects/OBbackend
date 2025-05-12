import { encodeToBase64, decodeBase64 } from './base_encoding';

const namePrimaryId = (id: string, prefix = 'ob_'): string => {
  return `${prefix}${encodeToBase64(id)}`;
};

const retrieveFromPrimaryId = (primaryId: string, prefix = 'ob_'): string => {
  if (primaryId.startsWith(prefix)) {
    return decodeBase64(primaryId.replace(/ob_/, ''));
  }

  return primaryId;
};

export { namePrimaryId, retrieveFromPrimaryId };
