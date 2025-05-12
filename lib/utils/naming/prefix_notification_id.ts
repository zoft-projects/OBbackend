const prefixNotificationId = (id: string): string => {
  const notificationId = `NOTIF_${id}`;

  return notificationId;
};

export { prefixNotificationId };
