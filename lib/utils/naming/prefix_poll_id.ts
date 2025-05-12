const prefixPollId = (id: string): string => {
  const pollId = `POLL0${id}`;

  return pollId;
};

export { prefixPollId };
