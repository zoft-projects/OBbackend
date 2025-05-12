import defaultAppConfigs from '../../config/default.json';
import { AssetEnum } from '../enums';

type ConfigType = typeof defaultAppConfigs;

type OneBayshoreUserIdentity = {
  obUserPsId: string;
  email: string;
  displayName: string;
  profileImgLink?: string;
  branchIds: string[];
  assumedBranchIds?: string[];
  divisionIds: string[];
  provinceCodes: string[];
  deptNames?: string[];
  accessLvl: number;
  jobLvl: number;
  jobId: string;
  hasAccess: boolean;
  deviceTokenValues: string[];
  systemIdentifiers: {
    empSystemId: string;
    systemName: string;
    tenantId: string;
    designation?: string;
  }[];
};

type AddressType = {
  streetAddress?: string;
  streetAddress1?: string;
  streetAddress2?: string;
  streetAddressLine2?: string;
  city: string;
  state?: string;
  province?: string;
  country: string;
  postalCode: string;
};

type ReadableAddressType = {
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

type FileUploadToS3Type = {
  fileType: string;
  content: string;
  type: AssetEnum;
};

type MultipartFileCreateToS3Type = {
  fileType: string;
  type: AssetEnum;
  noOfParts: number;
};

type MultipartFileCompleteToS3Type = {
  fileType: string;
  type: AssetEnum;
  fileName: string;
  uploadId: string;
  uploadedParts: { etag: string; partNumber: number }[];
};

type MultipartFileAbortToS3Type = {
  fileName: string;
  uploadId: string;
};

type FileUploadResponseType = {
  success: boolean;
  data: { fileName: string; url: string; submittedForCompression?: boolean };
};

type FileAbortResponseType = {
  success: boolean;
  data: { fileName: string };
};

type MultipartCreateFileUploadResponseType = {
  success: boolean;
  data: { fileName: string; uploadId: string; signedUrls: string[] };
};

type FileDeleteResponseType = {
  fileName: string;
};

type FileStatusResponseType = {
  compressionStatus: string;
};

type FileGuidelinesResponseType = {
  videoUpload?: string;
  videoConsent?: string;
};

type VideoGuidelinesGetType = {
  consent?: string;
  uploadDetails?: string;
};

type FileGuidelinesGetType = {
  videoGuidelines?: VideoGuidelinesGetType;
};

type JSONLikeType = {
  [key: string]: number | number[] | string | string[] | boolean | JSONLikeType | JSONLikeType[];
};

type ServiceConfigType = {
  endpoint?: string;
  apiKeyHeader: string;
  secretKeyName: string;
  baseUri?: string;
  host?: string;
};

// Re-export express http input types
export * from './api_input_types/create_user_express_type';
export * from './api_input_types/onboard_user_express_type';
export * from './api_input_types/branch_input_express_type';
export * from './api_input_types/create_news_feed_express_type';
export * from './api_input_types/create_prerequisite_acceptance_type';
export * from './api_input_types/create_alert_type';
export * from './api_input_types/visits_checkin_input_express_type';
export * from './api_input_types/job_board_input_express_type';
export * from './api_input_types/enrollment_express_type';
export * from './api_input_types/onetime_input_express_type';
export * from './api_input_types/recurring_availability_input_express_type';
export * from './api_input_types/create_support_ticket_express_type';
export * from './api_input_types/feature_provisions_express_type';
export * from './api_input_types/create_poll_type';
export * from './api_input_types/availabilities_input_express_type';
export * from './api_input_types/create_referral_input_express_type';
export * from './api_input_types/create_resource_input_express_type';
export * from './api_input_types/create_concern_input_express_type';
export * from './api_input_types/create_notification_express_type';
export * from './api_input_types/shift_offer_input_express_type';
export * from './api_input_types/milestone_input_express_type';
export * from './api_input_types/user_location_input_express_type';
export * from './api_input_types/notes_input_express_type';
export * from './api_input_types/mail_input_express_type';
export * from './api_input_types/chatV2_input_express_type';
export * from './api_input_types/s3_input_express_type';
export * from './api_input_types/multimedia_input_express_type';

// Re-export express http payload types
export * from './api_payload_types/alert_payload_express_type';
export * from './api_payload_types/auth_token_payload_express_type';
export * from './api_payload_types/user_info_payload_express_type';
export * from './api_payload_types/branch_payload_express_type';
export * from './api_payload_types/news_feed_payload_express_type';
export * from './api_payload_types/poll_payload_express_type';
export * from './api_payload_types/support_ticket_payload_express_type';
export * from './api_payload_types/visit_client_payload_express_type';
export * from './api_payload_types/procura_visit_payload_express_type';
export * from './api_payload_types/shift_offer_payload_express_type';
export * from './api_payload_types/availabilities_payload_express_type';
export * from './api_payload_types/job_board_payload_express_type';
export * from './api_payload_types/notification_payload_express_type';
export * from './api_payload_types/referral_payload_express_type';
export * from './api_payload_types/concern_payload_express_type';
export * from './api_payload_types/resource_payload_express_type';
export * from './api_payload_types/offers_payload_express_type';
export * from './api_payload_types/user_location_payload_express_type';
export * from './api_payload_types/mails_payload_express_type';
export * from './api_payload_types/metrics_payload_express_type';
export * from './api_payload_types/chatV2_group_payload_express_type';
export * from './api_payload_types/multimedia_payload_express_type';

// Re-export service operation types
export * from './operations_types/user_upsert_operation';
export * from './operations_types/anonymized_info_create_operation';
export * from './operations_types/branch_division_upsert_operation';
export * from './operations_types/news_feed_upsert_operation';
export * from './operations_types/prerequisite_upsert_operation';
export * from './operations_types/jobs_upsert_operation';
export * from './operations_types/alerts_upsert_operation';
export * from './operations_types/job_board_operation';
export * from './operations_types/wellness_note_upsert_operation';
export * from './operations_types/chat_group_upsert_operation';
export * from './operations_types/polls_upsert_operation';
export * from './operations_types/resource_upsert_operation';
export * from './operations_types/multi_media_operation';
export * from './operations_types/enrollment_upsert_operation';
export * from './operations_types/support_ticket_upsert_operation';
export * from './operations_types/temp_data_upsert_operation';
export * from './operations_types/notification_upsert_operation';
export * from './operations_types/milestones_upsert_operation';
export * from './operations_types/milestone_upsert_operation';
export * from './operations_types/user_location_modified_operation';
export * from './operations_types/metrics_upsert_operation';

// Re-export model types
export * from './models_types/user_model_type';
export * from './models_types/branch_division_model_type';
export * from './models_types/chat_group_user_model_type';
export * from './models_types/chat_v2_model_type';
export * from './models_types/news_model_type';
export * from './models_types/anonymized_info_model_type';
export * from './models_types/prerequisite_model_type';
export * from './models_types/alert_model_type';
export * from './models_types/job_model_type';
export * from './models_types/poll_model_type';
export * from './models_types/push_notification_model_type';
export * from './models_types/job_board_model_type';
export * from './models_types/wellness_note_model_type';
export * from './models_types/bug_model_type';
export * from './models_types/resources_model_type';
export * from './models_types/support_ticket_model_type';
export * from './models_types/temp_data_model_type';
export * from './models_types/notification_model_type';
export * from './models_types/milestone_model_type';
export * from './models_types/feature_provision_model_type';
export * from './models_types/user_location_model_type';
export * from './models_types/feature_summaries_model_type';
export * from './models_types/quickblox_message_backup_model_type';

// Re-export consumer types
export * from './api_consumer_types/client_consumer_type';
export * from './api_consumer_types/visit_consumer_type';
export * from './api_consumer_types/availabilities_consumer_type';
export * from './api_consumer_types/procura_visit_consumer_type';
export * from './api_consumer_types/chat_group_consumer_type';
export * from './api_consumer_types/quickblox_user_consumer_type';
export * from './api_consumer_types/shift_offer_consumer_type';
export * from './api_consumer_types/employee_consumer_type';
export * from './api_consumer_types/employee_competency_consumer_type';
export * from './api_consumer_types/mails_consumer_type';

// Re-export vendor types
export * from './vendor_types/mixpanel_vendor_type';
export * from './vendor_types/quickblox_vendor_type';
export * from './vendor_types/firebase_vendor_type';
export * from './vendor_types/azure_vendor_type';

export {
  ConfigType,
  OneBayshoreUserIdentity,
  AddressType,
  ReadableAddressType,
  FileUploadToS3Type,
  FileUploadResponseType,
  FileDeleteResponseType,
  FileStatusResponseType,
  MultipartFileAbortToS3Type,
  MultipartFileCreateToS3Type,
  MultipartCreateFileUploadResponseType,
  MultipartFileCompleteToS3Type,
  JSONLikeType,
  ServiceConfigType,
  FileAbortResponseType,
  FileGuidelinesResponseType,
  FileGuidelinesGetType,
};
