const getTestUserPsId = (testUserEmail: string): string => {
  const testUserAccounts = {
    obtestanita: '0000023456',
    obtestjames: '0000023457',
    obtestnita: '0000023458',
    obtestsamantha: '0000023459',
    obtestrita: '0000023460',
    obtestjason: '0000023461',
    obtestgeorge: '0000023462',
    obtestsunita: '0000023463',
  };

  const [username] = testUserEmail.split('@');

  if (testUserAccounts[username.toLowerCase()]) {
    testUserAccounts[username.toLowerCase()];
  }

  return 'UNKNOWN_PSID';
};

const prefixPsId = (id: string): string => (id ? `0000000000${id}`.slice(-10) : 'UNKNOWN_PSID');

const userPsId = (id: string, userEmail?: string): string => {
  if (!id) {
    return getTestUserPsId(userEmail);
  }

  return prefixPsId(id);
};

export { userPsId };
