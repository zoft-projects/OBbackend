import { createNanoId } from '../';

const prefixUserLocationId = (id: string = createNanoId(7, 'AlphaNumeric')): string => {
  const userLocationId = `geo_${id}`;

  return userLocationId;
};

export { prefixUserLocationId };
