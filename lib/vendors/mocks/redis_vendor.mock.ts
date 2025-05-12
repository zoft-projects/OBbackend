import { addSeconds } from 'date-fns';

type data =
  | {
      [key: string]: any;
    }
  | {
      [key: string]: any;
    }[];

const getRedisMockConnection = (() => {
  const cacheMap = new Map();

  const setInCache = (cacheName: string, data: data, options: { EX?: number }) => {
    if (!data || typeof data !== 'object') {
      return;
    }
    let expires: Date;
    if (options.EX) {
      expires = addSeconds(new Date(), options.EX);
    }
    cacheMap.set(cacheName, {
      data,
      expires,
    });
  };
  const getFromCache = (cacheName: string) => {
    if (!cacheMap.has(cacheName)) {
      return;
    }

    const currentValue = cacheMap.get(cacheName);

    if (currentValue.expires && currentValue.expires < new Date()) {
      cacheMap.delete(cacheName);

      return;
    }

    return currentValue.data;
  };

  return {
    set: setInCache,
    get: getFromCache,
  };
})();

export { getRedisMockConnection };
