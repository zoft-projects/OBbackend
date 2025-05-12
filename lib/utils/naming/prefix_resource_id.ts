const prefixResourceId = (id: string): string => {
  const resourceId = `RS_0${id}`;

  return resourceId;
};

export { prefixResourceId };
