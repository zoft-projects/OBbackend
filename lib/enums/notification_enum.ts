// TODO can increase later depending upon requirement
export enum NotificationTypeEnum {
  Individual = 'Individual',
  Group = 'Group',
  Global = 'Global',
}

// TODO can increase later depending upon requirement
export enum NotificationOriginEnum {
  Alert = 'Alert',
  Polls = 'Polls',
  System = 'System',
}

export enum NotificationStatusEnum {
  Pending = 'Pending',
  Failed = 'Failed',
  Sent = 'Sent',
}

export enum NotificationPlacementEnum {
  Push = 'Push',
  Dashboard = 'Dashboard',
  UserQueue = 'UserQueue',
  Email = 'Email',
  Sms = 'Sms',
  Prerequisite = 'Prerequisite',
}
