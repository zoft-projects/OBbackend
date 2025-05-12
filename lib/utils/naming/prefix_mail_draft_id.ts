const prefixDraftMessageId = (id: string): string => {
  const draftMessageId = `DRAFT0${id}`;

  return draftMessageId;
};

export { prefixDraftMessageId };
