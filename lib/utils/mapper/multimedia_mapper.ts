import { FileGuidelinesGetType, FileGuidelinesResponseType } from '../../types';

const mapFileGuidelinesToApiPayload = (guidelines: FileGuidelinesResponseType): FileGuidelinesGetType => {
  const { videoUpload, videoConsent } = guidelines;
  const mappedGuidelines = {} as FileGuidelinesGetType;

  if (videoConsent) {
    if (!mappedGuidelines.videoGuidelines) {
      mappedGuidelines.videoGuidelines = {};
    }
    mappedGuidelines.videoGuidelines.consent = videoConsent;
  }
  if (videoUpload) {
    if (!mappedGuidelines.videoGuidelines) {
      mappedGuidelines.videoGuidelines = {};
    }
    mappedGuidelines.videoGuidelines.uploadDetails = videoUpload;
  }

  return mappedGuidelines;
};

export { mapFileGuidelinesToApiPayload };
