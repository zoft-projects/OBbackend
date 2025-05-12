enum VisitStatusEnum {
  Open = 'Open',
  Closed = 'Closed',
  Missed = '',
}

enum VisitActionEnum {
  Ongoing = 'Ongoing',
  Disabled = 'Disabled',
  Visited = 'Visited',
  Future = 'Future',
  Available = 'Available',
  // TODO Remove this after proper assessment in the listing feature
  Unknown = 'Unknown',
}

enum VisitTypeEnum {
  Timeless = 'Timeless',
  Regular = 'Regular',
}

export { VisitStatusEnum, VisitActionEnum, VisitTypeEnum };
