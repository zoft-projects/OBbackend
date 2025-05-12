import { JSONLikeType } from '..';

type UserAuthenticatedPayloadType = {
  accessToken: string;
  expiresIn: number;
  idToken?: string;
  refreshToken?: string;
  tokenType?: string;
  hasAccess: boolean;
  identityToken?: string | null;
  primaryUserId?: string | null;
  vendorIdentities: {
    vendorName: string;
    vendorValues: JSONLikeType;
  }[];
};

export { UserAuthenticatedPayloadType };
