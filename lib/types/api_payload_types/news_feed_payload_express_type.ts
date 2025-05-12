import { AudienceEnum, NewsFeedEnum, PriorityEnum, ReactionEnum } from '../../enums';

type NewsFeedPayloadType = {
  postId: string;
  postTitle: string;
  postDescription: string;
  postType: NewsFeedEnum;
  postTag: AudienceEnum;
  postImageUrl: string;
  postImageOrientation: string;
  // TODO to add audio and video
  employeePosted: {
    employeeId: string;
    employeeName: string;
    profileImage: string;
  };
  employeeRecognized?: {
    employeePsId: string;
    displayName?: string;
    userImageLink?: string;
  };
  priority: PriorityEnum;
  reaction: {
    allReactionTypes: ReactionEnum[];
    count: number;
    currentReactionType: ReactionEnum;
    isReacted: boolean;
    sampleReactedUsers: string[];
  };
  postCreatedDate: Date;
};

export { NewsFeedPayloadType };
