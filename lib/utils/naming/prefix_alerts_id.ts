const prefixAlertId = (id: string): string => {
  const alertId = `AL0${id}`;

  return alertId;
};

export { prefixAlertId };
