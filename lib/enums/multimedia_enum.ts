export enum MultiMediaEnum {
  Video = 'Video',
  Image = 'Image',
  Audio = 'Audio',
  Document = 'Document',
}

export enum ReadFileTypeEnum {
  PresignedUrl = 'PresignedUrl',
  ReadableObject = 'ReadableObject',
}

export enum S3FoldersEnum {
  News = 'news/',
  Resources = 'resources/',
  SupportTickets = 'support-tickets/',
  Badge = 'badge/',
  ProfileImage = 'profile-images/',
  WellnessImage = 'wellness-images/',
}

export enum AssetEnum {
  ProfileImage = 'ProfileImage',
  ProfileVideo = 'ProfileVideo',
  SkillsCertificate = 'SkillsCertificate',
  ImmunizationCertificate = 'ImmunizationCertificate',
}

export enum MultipartUploadPhaseEnum {
  create = 'create',
  complete = 'complete',
  abort = 'abort',
}

export enum FileGuidelinesEnum {
  VideoGuidelines = 'ob-video-guidelines',
  VideoConsent = 'ob-video-consent',
}
