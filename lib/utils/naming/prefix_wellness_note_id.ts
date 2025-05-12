const prefixWellnessNoteId = (id: string): string => {
  const wellnessNoteId = `WN_${id}`;

  return wellnessNoteId;
};

export { prefixWellnessNoteId };
