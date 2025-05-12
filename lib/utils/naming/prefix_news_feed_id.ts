import { NewsFeedEnum } from '../../enums';

const prefixNewsFeedId = (id: string, newsFeedType: NewsFeedEnum): string => {
  let newsFeedId: string;
  switch (newsFeedType) {
    case NewsFeedEnum.News:
      newsFeedId = `P0N0${id}`;
      break;
    case NewsFeedEnum.Story:
      newsFeedId = `P0S0${id}`;
      break;
    case NewsFeedEnum.Recognition:
      newsFeedId = `P0R0${id}`;
      break;
    default:
      newsFeedId = id;
      break;
  }

  return newsFeedId;
};

export { prefixNewsFeedId };
