enum NewsVisibilityEnum {
  Self = 'Self',
  All = 'All',
}

enum ReactionUndoEnum {
  Unlike = 'Unlike',
  Unfunny = 'Unfunny',
  Uncool = 'Uncool',
}

enum ReactionEnum {
  Like = 'Like',
  Funny = 'Funny',
  Cool = 'Cool',
}
enum NewsFeedEnum {
  News = 'News',
  Story = 'Story',
  Recognition = 'Recognition',
}

enum FileTransportEnum {
  Link = 'Link',
  Buffer = 'Buffer',
}

enum MediaOrientationEnum {
  Portrait = 'Portrait',
  Landscape = 'Landscape',
  Square = 'Square',
}

export { NewsFeedEnum, NewsVisibilityEnum, FileTransportEnum, MediaOrientationEnum, ReactionEnum, ReactionUndoEnum };
