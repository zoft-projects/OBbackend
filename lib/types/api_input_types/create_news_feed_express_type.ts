import {
  AudienceEnum,
  FileTransportEnum,
  MultiMediaEnum,
  NewsFeedEnum,
  PriorityEnum,
  ProvincialCodesEnum,
  ReactionEnum,
  ReactionUndoEnum,
  StatusEnum,
} from '../../enums';

type HttpPOSTCreateOBNewsFeed = {
  overrideId?: string;
  newsId: string;
  title: string;
  description: string;
  category: NewsFeedEnum;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  isShareable: boolean;
  fileType: FileTransportEnum.Buffer | FileTransportEnum.Link;
  mediaType: MultiMediaEnum;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  recognizedUserId?: string;
  status?: StatusEnum;
  approvedById?: string;
  priority?: PriorityEnum;
  expiresInDays?: number;
};

type HttpPOSTNewsInteraction = {
  newsId: string;
  reactionType: ReactionEnum | ReactionUndoEnum;
};

export { HttpPOSTCreateOBNewsFeed, HttpPOSTNewsInteraction };
