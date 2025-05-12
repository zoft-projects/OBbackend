import { NextFunction } from 'connect';
import express from 'express';
import createError from 'http-errors';

import { UserLevelEnum } from '../../enums';
import { mapAccessLevelToName } from '../../utils';

const accessControlMiddlewareHOF =
  (supportedLevels: UserLevelEnum[]) =>
  async (req: express.Request, _res: express.Response, next: NextFunction): Promise<void> => {
    if (
      !req.obUserIdentity?.accessLvl ||
      !supportedLevels.includes(mapAccessLevelToName(req.obUserIdentity.accessLvl))
    ) {
      next(createError(403, 'Unauthorized Access'));

      return;
    }

    next();
  };

export { accessControlMiddlewareHOF };
