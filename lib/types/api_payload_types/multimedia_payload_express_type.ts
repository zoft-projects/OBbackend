type MultimediaAttachmentPayloadType = {
  /**
   * @deprecated use uploadUrls instead
   */
  signedUrls?: string[];
  uploadUrls?: string[];
  uploadId?: string;
  fileIdentifier?: string;
  attachmentUrl?: string;
  featureName: string;
};

export { MultimediaAttachmentPayloadType };
