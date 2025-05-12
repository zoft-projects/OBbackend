enum RemoteConfigFileNameEnum {
  BranchFeatureProvisioning = 'branch_feature_provisioning',
}

enum BranchFeaturesProvisionEnum {
  WellnessNotes = 'wellness_notes.action.enabled',
  WellnessStatus = 'wellness_status.action.enabled',
  Shifts = 'shifts.view.enabled',
  ShiftsCheckout = 'shifts_checkout.action.enabled',
  ShiftsCareplans = 'shifts_careplans.view.enabled',
  ShiftsCareplansWrite = 'shifts_careplans.action.enabled',
  ShiftsRisks = 'shifts_risks.view.enabled',
  ShiftsDirections = 'shifts_directions.view.enabled',
  ShiftsMileageInput = 'shifts_mileage.input.enabled',
  ShiftsRisksAgreementCheck = 'shifts_risks.checkbox.enabled',
  Chats = 'chats.view.enabled',
  ChatsAttachments = 'chats_attachments.action.enabled',
  ChatsOfflineHours = 'chats_offline_hours.view.enabled',
  JobShifts = 'job_shifts.view.enabled',
  DmAvailabilityCalendar = 'dm_availability_calendar.view.enabled',
  ForcedUpdate = 'forced_update.view.enabled',
  AlayacareCard = 'shifts_alayacare.view.enabled',
  ShiftsGeolocation = 'shifts_geoLocation.action.enabled',
  ShiftsGeolocationOptional = 'shifts_geoLocation.optional_action.enabled',
  ShiftsProgressNotes = 'shifts_progress_notes.view.enabled',
  ShiftsProgressNotesWrite = 'shifts_progress_notes.action.enabled',
  ShiftsProgressNotePrivateWrite = 'shifts_private_progress_notes.action.enabled',
  ShiftsDetailsV2 = 'shifts_details_v2.view.enabled',
  ShiftsMultipleCheckinSupport = 'shifts_multiple_checkins.action.enabled',
  NotificationsV2 = 'notifications_v2.view.enabled',
  NotificationsClearAllV2 = 'notifications_clear_all_v2.action.enabled',
  IdBadge = 'id_badge.view.enabled',
  ShiftsCalcomSystemSupport = 'calcom_shifts.view.enabled',
  ChatV2 = 'chats_v2.view.enabled',
  EmailFeature = 'email_feature.view.enabled',
  ShiftsShorterCheckinWindow = 'shifts_shorter_checkin_window.view.enabled',

  /**
   * @deprecated DmProfileEdit not required
   */
  DmProfileEdit = 'dm_profile_edit.view.enabled',
}

export { RemoteConfigFileNameEnum, BranchFeaturesProvisionEnum };
