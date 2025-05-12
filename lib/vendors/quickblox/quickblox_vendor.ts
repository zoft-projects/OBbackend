import config from 'config';
import QB from 'quickblox';
import { QBCustomClassNameEnum, VendorExternalEnum, ChatGroupEnum } from '../../enums';
import { logError, logInfo } from '../../log/util';
import {
  ChatUpsertOperationType,
  QuickBloxChatGroupType,
  QuickBloxMessageType,
  QuickBloxUserType,
  QuickbloxUserUpsertOperationType,
  QuickbloxVendorConfigType,
} from '../../types';
import { createNanoId } from '../../utils';
import { getSecret } from '../aws/secret_manager';

const {
  secretKeyName: qbSecretKeyName,
  qbApiEndpoint,
  qbChatEndpoint,
  qbApplicationId,
  debug,
}: {
  secretKeyName: string;
  qbApiEndpoint: string;
  qbChatEndpoint: string;
  qbApplicationId: string;
  debug: boolean;
} = config.get('Services.quickblox');

// Configure QuickBlox
const qbConfig = {
  endpoints: {
    api: qbApiEndpoint, // set custom API endpoint
    chat: qbChatEndpoint, // set custom Chat endpoint
  },
  debug, // Set true to output to console
};

const getQuickbloxConfig = async (): Promise<QuickbloxVendorConfigType> => {
  const [qbAuthKey, qbSecretKey, qbAccountKey] = ((await getSecret(qbSecretKeyName)) ?? '').split('|');
  const quickbloxConfig: QuickbloxVendorConfigType = {
    qbApplicationId,
    qbAuthKey,
    qbAuthSecret: qbSecretKey,
    qbAccountKey,
    qbApiEndpoint,
    qbChatEndpoint,
  };

  return quickbloxConfig;
};

// Check QuickBlox session validity
const isSessionValid = (): Promise<boolean> => {
  return new Promise((resolve) => {
    QB.getSession((error: Error | null, session?: unknown) => {
      if (error || !session) {
        logError(
          `[${VendorExternalEnum.Quickblox}] isSessionTokenValid - ERROR checking validity of QuickBlox session: ${error.message}`,
        );
        resolve(false); // Session is not valid
      } else {
        logInfo(
          `[${VendorExternalEnum.Quickblox}] isSessionTokenValid - checked validity of QuickBlox session, and token is retrieved from QB`,
        );
        resolve(true); // Session is valid
      }
    });
  });
};

// Create QuickBlox session
const createSession = async (): Promise<string> => {
  try {
    // Retrieve QuickBlox configuration from secret manager
    const [qbAuthKey, qbSecretKey, qbAccountKey, qbLogin, qbPassword] = (await getSecret(qbSecretKeyName)).split('|');

    // Initialize QuickBlox with the configuration
    QB.init(qbApplicationId, qbAuthKey, qbSecretKey, qbAccountKey, qbConfig);

    const sessionParams = { login: qbLogin, password: qbPassword };

    return new Promise((resolve, reject) => {
      QB.createSession(sessionParams, (err: Error, result: { token: string }) => {
        if (err) {
          reject(err);
        } else {
          // The result.token field contains the session token
          logInfo(`[${VendorExternalEnum.Quickblox}] createSession - created new QuickBlox session token`);

          resolve(result.token);
        }
      });
    });
  } catch (sessionErr) {
    logError(
      `[${VendorExternalEnum.Quickblox}] createSession - ERROR creating new QuickBlox session: ${sessionErr.message}`,
    );
  }
};

// Initialize QuickBlox connection
const initializeQBConnection = async (): Promise<any> => {
  // Check if session is valid
  const isSession = await isSessionValid();

  if (!isSession) {
    // Create a new session if it's not valid
    await createSession();
  }

  return QB; // Return QuickBlox instance
};

const createUser = async (
  transactionId: string,
  requestData: QuickbloxUserUpsertOperationType,
): Promise<{
  employeePsId: string;
  quickBloxId: string;
  quickBloxPassword: string;
}> => {
  try {
    logInfo(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] createUser - create new QuickBlox User initiated, email: ${requestData.email}`,
    );

    await initializeQBConnection();

    const { email, displayName, customData } = requestData;

    const userPassword = createNanoId(8);

    const userData = {
      email,
      login: email,
      password: userPassword,
      full_name: displayName,
      custom_data: JSON.stringify(customData),
    };

    return new Promise((resolve, reject) => {
      QB.users.create(userData, function (error: Error, result: QuickBloxUserType) {
        if (error) {
          logError(
            `[${transactionId}] [${VendorExternalEnum.Quickblox}] createUser - ERROR while creating user, psId: ${
              customData.psId
            }, ${JSON.stringify(error.message)}`,
          );

          reject(new Error(JSON.stringify(error.message)));
        } else {
          logInfo(
            `[${transactionId}] [${
              VendorExternalEnum.Quickblox
            }] createUser - created new QuickBlox User with email: ${email}, user: ${JSON.stringify(result)}`,
          );

          resolve({
            employeePsId: customData.psId,
            quickBloxId: result?.id.toString(),
            quickBloxPassword: userPassword,
          });
        }
      });
    });
  } catch (createError) {
    logError(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] createUser - ERROR while creating user ${createError.message}`,
    );

    throw createError;
  }
};

const updateUser = async (
  transactionId: string,
  requestData: Partial<QuickbloxUserUpsertOperationType>,
): Promise<QuickBloxUserType> => {
  try {
    logInfo(`[${transactionId}] [${VendorExternalEnum.Quickblox}] updateUser - update QuickBlox User initiated`);

    await initializeQBConnection();

    if (!requestData.quickBloxId) {
      throw new Error('Quickblox id is mandatory');
    }

    const updatedUserData = {
      email: requestData.email,
      login: requestData.email,
      full_name: requestData.displayName,
      custom_data: JSON.stringify(requestData.customData),
    };

    logInfo(
      `[${transactionId}] [${
        VendorExternalEnum.Quickblox
      }] updateUser - update QuickBlox User, updatedUser: ${JSON.stringify(updatedUserData)}`,
    );

    return new Promise((resolve, reject) => {
      QB.users.update(
        parseInt(requestData.quickBloxId),
        updatedUserData,
        function (error: Error, result: QuickBloxUserType) {
          if (error) {
            logError(
              `[${transactionId}] [${
                VendorExternalEnum.Quickblox
              }] updateUser - ERROR while updating user ${JSON.stringify(error.message)}`,
            );

            reject(new Error(JSON.stringify(error.message)));
          } else {
            logInfo(
              `[${transactionId}] [${
                VendorExternalEnum.Quickblox
              }] updateUser - created new QuickBlox User, user: ${JSON.stringify(result)}`,
            );

            resolve(result);
          }
        },
      );
    });
  } catch (updateError) {
    logError(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] updateUser - ERROR while updating user ${updateError.message}`,
    );

    throw updateError;
  }
};

const deleteUser = async (transactionId: string, userId: string): Promise<string> => {
  try {
    logInfo(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] deleteUser - delete QuickBlox User initiated, userId: ${userId}`,
    );

    await initializeQBConnection();

    return new Promise((resolve, reject) => {
      QB.users.delete(parseInt(userId), function (error: Error) {
        if (error) {
          logError(
            `[${transactionId}] [${
              VendorExternalEnum.Quickblox
            }] deleteUser - ERROR while deleting user ${JSON.stringify(error.message)}`,
          );

          reject(new Error(JSON.stringify(error.message)));
        } else {
          logInfo(`[${transactionId}] [${VendorExternalEnum.Quickblox}] deleteUser - deleted user, userId: ${userId}`);

          resolve(userId);
        }
      });
    });
  } catch (deleteError) {
    logError(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] deleteUser - ERROR while deleting user ${deleteError.message}`,
    );

    throw deleteError;
  }
};

const listUsers = async (
  transactionId: string,
  filters: { quickbloxIds?: string[]; emails?: string[] },
  options?: { page?: number; limit?: number },
): Promise<QuickBloxUserType[]> => {
  try {
    logInfo(`[${transactionId}] [${VendorExternalEnum.Quickblox}] listUsers - list all Users initiated`);

    await initializeQBConnection();

    const params: { [key: string]: unknown } = {
      page: options?.page ?? 1,
      per_page: options?.limit ?? 10,
    };

    if (Array.isArray(filters.quickbloxIds) && filters.quickbloxIds.length) {
      params.filter = {
        field: 'id',
        param: 'in',
        value: filters.quickbloxIds?.map((userId) => parseInt(userId)),
      };
    }

    if (Array.isArray(filters.emails) && filters.emails.length) {
      params.filter = {
        field: 'email',
        param: 'in',
        value: filters.emails,
      };
    }

    return new Promise((resolve, reject) => {
      QB.users.listUsers(params, function (error: Error, result) {
        if (error) {
          logError(
            `[${transactionId}] [${
              VendorExternalEnum.Quickblox
            }] listUsers - ERROR while listing Users ${JSON.stringify(error.message)}`,
          );

          reject(new Error(JSON.stringify(error.message)));
        } else {
          logInfo(
            `[${transactionId}] [${VendorExternalEnum.Quickblox}] listUsers - list Quickblox Users COMPLETED, total retrieved users: ${result.items?.length}`,
          );

          const users = (result.items ?? []).map((ele) => ele.user);

          resolve(users);
        }
      });
    });
  } catch (listError) {
    logError(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] listUsers - ERROR while listing Users ${listError.message}`,
    );

    throw listError;
  }
};

const createGroup = async (transactionId: string, requestData: ChatUpsertOperationType): Promise<string> => {
  try {
    logInfo(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] createGroup - create new QuickBlox Chat Group initiated`,
    );

    await initializeQBConnection();

    const metadata: { [key: string]: unknown } = {
      class_name: requestData.className,
      branchId: requestData.branchId,
      branchName: requestData.branchName,
      isAuto: requestData.isAuto,
      isBroadcast: requestData.groupType === ChatGroupEnum.Broadcast,
      isAnnouncement: requestData.groupType === ChatGroupEnum.Broadcast,
      isArchived: requestData.isArchived,
    };

    if (requestData.primaryUserPsId) {
      metadata.primaryUserPsId = requestData.primaryUserPsId;
    }

    const groupData = {
      type: 2,
      name: requestData.groupName,
      occupants_ids: requestData.occupantIds?.map((id) => parseInt(id)),
      data: metadata,
    };

    return new Promise((resolve, reject) => {
      QB.chat.dialog.create(groupData, function (error: Error, result) {
        if (error) {
          logError(
            `[${transactionId}] [${
              VendorExternalEnum.Quickblox
            }] createGroup - ERROR while creating chat group ${JSON.stringify(error.message)}`,
          );

          reject(new Error(JSON.stringify(error.message)));
        } else {
          logInfo(
            `[${transactionId}] [${
              VendorExternalEnum.Quickblox
            }] createGroup - created new QuickBlox Chat Group, group: ${JSON.stringify(result)}`,
          );

          resolve(result._id);
        }
      });
    });
  } catch (createError) {
    logError(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] createGroup - ERROR while creating group ${createError.message}`,
    );

    throw createError;
  }
};

const updateGroup = async (
  transactionId: string,
  groupId: string,
  requestData: Partial<ChatUpsertOperationType>,
): Promise<string> => {
  try {
    logInfo(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] updateGroup - create new QuickBlox Chat Group initiated`,
    );

    await initializeQBConnection();

    const metadata: { [key: string]: unknown } = {};

    if (typeof requestData.isArchived === 'boolean') {
      metadata.class_name = requestData.className;
      metadata.isArchived = requestData.isArchived;
    }

    if (requestData.branchName) {
      metadata.class_name = requestData.className;
      metadata.branchName = requestData.branchName;
    }

    const groupData: { [key: string]: unknown } = {
      data: metadata,
    };

    if (requestData.groupName) {
      groupData.name = requestData.groupName;
    }

    return new Promise((resolve, reject) => {
      QB.chat.dialog.update(groupId, groupData, function (error: Error, result) {
        if (error) {
          logError(
            `[${transactionId}] [${
              VendorExternalEnum.Quickblox
            }] updateGroup - ERROR while updating chat group ${JSON.stringify(error.message)}`,
          );

          reject(new Error(JSON.stringify(error.message)));
        } else {
          logInfo(
            `[${transactionId}] [${
              VendorExternalEnum.Quickblox
            }] updateGroup - updated new QuickBlox Chat Group, group: ${JSON.stringify(result)}`,
          );

          resolve(result._id);
        }
      });
    });
  } catch (updateError) {
    logError(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] updateGroup - ERROR while updating group ${updateError.message}`,
    );

    throw updateError;
  }
};

const deleteGroup = async (transactionId: string, groupId: string): Promise<string> => {
  try {
    logInfo(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] deleteGroup - delete QuickBlox Chat Group initiated, groupId: ${groupId}`,
    );

    await initializeQBConnection();

    return new Promise((resolve, reject) => {
      if (typeof QB.chat.dialog.delete === 'function') {
        QB.chat.dialog.delete([groupId], { force: 1 }, function (error: Error) {
          if (error) {
            logError(
              `[${transactionId}] [${
                VendorExternalEnum.Quickblox
              }] deleteGroup - ERROR while deleting chat group ${JSON.stringify(error.message)}`,
            );

            reject(new Error(JSON.stringify(error.message)));
          } else {
            logInfo(`[${transactionId}] [${VendorExternalEnum.Quickblox}] deleteGroup - deleted Chat Group`);

            resolve(groupId);
          }
        });
      } else {
        updateGroup(transactionId, groupId, {
          className: QBCustomClassNameEnum.GroupMetadata,
          isArchived: true,
        })
          .then(() => {
            logInfo(
              `[${transactionId}] [${VendorExternalEnum.Quickblox}] deleteGroup - Soft Delete Chat Group, isArchived is true`,
            );
            resolve(groupId);
          })
          .catch((error) => {
            logError(
              `[${transactionId}] [${
                VendorExternalEnum.Quickblox
              }] deleteGroup - ERROR while soft delete chat group chat group ${JSON.stringify(error.message)}`,
            );
            reject(new Error(JSON.stringify(error.message)));
          });
      }
    });
  } catch (deleteError) {
    logError(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] deleteGroup - ERROR while deleting group ${deleteError.message}`,
    );

    throw deleteError;
  }
};

const addUsersToGroup = async (transactionId: string, groupId: string, occupantIds: string[]): Promise<string> => {
  try {
    logInfo(`[${transactionId}] [${VendorExternalEnum.Quickblox}] addUsersToGroup - add Users to Chat Group initiated`);

    await initializeQBConnection();

    return new Promise((resolve, reject) => {
      QB.chat.dialog.update(
        groupId,
        {
          push_all: { occupants_ids: occupantIds.map((id) => +id) },
        },
        function (error: Error) {
          if (error) {
            logError(
              `[${
                VendorExternalEnum.Quickblox
              }] addUsersToGroup - ERROR while adding Users to Chat Group ${JSON.stringify(error.message)}`,
            );

            reject(new Error(JSON.stringify(error.message)));
          } else {
            logInfo(`[${transactionId}] [${VendorExternalEnum.Quickblox}] addUsersToGroup - added Users to Chat Group`);

            resolve(groupId);
          }
        },
      );
    });
  } catch (error) {
    logError(
      `[${transactionId}] [${
        VendorExternalEnum.Quickblox
      }] addUsersToGroup - ERROR while adding Users to Chat Group ${JSON.stringify(error.message)}`,
    );

    throw error;
  }
};

const removeUsersFromGroup = async (transactionId: string, groupId: string, occupantIds: string[]): Promise<string> => {
  try {
    logInfo(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] removeUsersFromGroup - remove Users from Chat Group initiated`,
    );

    await initializeQBConnection();

    return new Promise((resolve, reject) => {
      QB.chat.dialog.update(
        groupId,
        {
          pull_all: { occupants_ids: occupantIds.map((id) => +id) },
        },
        function (error: Error) {
          if (error) {
            logError(
              `[${
                VendorExternalEnum.Quickblox
              }] removeUsersFromGroup - ERROR while removing Users from Chat Group ${JSON.stringify(error.message)}`,
            );

            reject(new Error(JSON.stringify(error.message)));
          } else {
            logInfo(
              `[${transactionId}] [${VendorExternalEnum.Quickblox}] removeUsersFromGroup - removed Users from Chat Group`,
            );

            resolve(groupId);
          }
        },
      );
    });
  } catch (error) {
    logError(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] removeUsersFromGroup - ERROR while removing Users from Chat Group ${error.message}`,
    );

    throw error;
  }
};

const listGroups = async (
  transactionId: string,
  filters: { quickbloxIds?: string[]; groupId?: string; branchId?: string; groupType?: ChatGroupEnum },
  options?: { skip?: number; limit?: number },
): Promise<QuickBloxChatGroupType[]> => {
  try {
    logInfo(`[${transactionId}] [${VendorExternalEnum.Quickblox}] listGroups - list all chat groups initiated`);

    await initializeQBConnection();

    const filter: { [key: string]: any } = {
      sort_desc: 'created_at',
      skip: options?.skip ?? 0,
      limit: options?.limit ?? 10,
      type: 2,
    };

    if (filters.groupId) {
      filter._id = filters.groupId;
    }

    if (Array.isArray(filters.quickbloxIds) && filters.quickbloxIds.length !== 0) {
      filter.occupants_ids = {
        all: filters.quickbloxIds?.map((userId) => parseInt(userId)),
      };
    }

    if (filters.branchId) {
      filter.data = { branchId: filters.branchId, class_name: QBCustomClassNameEnum.GroupMetadata };
    }

    if (filters.groupType) {
      filter.data = {
        ...filter.data,
        isAnnouncement: filters.groupType === ChatGroupEnum.Broadcast ? true : false,
        class_name: QBCustomClassNameEnum.GroupMetadata,
      };
    }

    return new Promise((resolve, reject) => {
      QB.chat.dialog.list(filter, function (error: Error, result) {
        if (error) {
          logError(
            `[${transactionId}] [${
              VendorExternalEnum.Quickblox
            }] listGroups - ERROR while listing chat groups ${JSON.stringify(error.message)}`,
          );

          reject(new Error(JSON.stringify(error.message)));
        } else {
          logInfo(`[${transactionId}] [${VendorExternalEnum.Quickblox}] listGroups - list Quickblox Chat Groups`);

          resolve(result.items);
        }
      });
    });
  } catch (listError) {
    logError(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] listGroups - ERROR while listing chat groups ${listError.message}`,
    );

    throw listError;
  }
};

const getGroupMessages = async (
  transactionId: string,
  dialogId: string,
  options?: { lastMessageId?: string; limit?: number; skip?: number; sort?: 'asc' | 'desc' },
): Promise<QuickBloxMessageType[]> => {
  try {
    logInfo(
      `[${transactionId}] [${VendorExternalEnum.Quickblox}] getGroupMessages - fetching messages for dialogId: ${dialogId}`,
    );

    await initializeQBConnection();

    const queryParams: {
      _id?: string;
      chat_dialog_id: string;
      limit?: number;
      skip?: number;
      sort_asc?: string;
      sort_desc?: string;
    } = {
      chat_dialog_id: dialogId,
      limit: options?.limit ?? 100,
      skip: options?.skip ?? 0,
    };

    if (options?.sort === 'asc') {
      queryParams.sort_asc = 'date_sent';
    } else {
      queryParams.sort_desc = 'date_sent';
    }

    // Check if lastMessageId is provided for pagination
    if (options?.lastMessageId) {
      if (options.sort === 'asc') {
        queryParams['_id[gt]'] = options.lastMessageId; // Get messages after lastMessageId
      } else {
        queryParams['_id[lt]'] = options.lastMessageId; // Get messages before lastMessageId
      }
    }

    return new Promise((resolve, reject) => {
      QB.chat.message.list(queryParams, function (error: Error, result) {
        if (error) {
          logError(
            `[${transactionId}] [${VendorExternalEnum.Quickblox}] getGroupMessages - ERROR: ${JSON.stringify(
              error.message,
            )}`,
          );
          reject(new Error(JSON.stringify(error.message)));
        } else {
          logInfo(
            `[${transactionId}] [${VendorExternalEnum.Quickblox}] getGroupMessages - retrieved messages successfully`,
          );
          resolve(result.items);
        }
      });
    });
  } catch (error) {
    logError(`[${transactionId}] [${VendorExternalEnum.Quickblox}] getGroupMessages - ERROR: ${error.message}`);
    throw error;
  }
};

createSession()
  .then(() => {
    logInfo(`[${VendorExternalEnum.Quickblox}] Created new QuickBlox session token`);
  })
  .catch((error) => {
    logError(`[${VendorExternalEnum.Quickblox}] ERROR creating new QuickBlox session: ${error.message}`);
  });

export {
  initializeQBConnection,
  createUser,
  updateUser,
  deleteUser,
  listUsers,
  createGroup,
  updateGroup,
  deleteGroup,
  addUsersToGroup,
  removeUsersFromGroup,
  listGroups,
  getQuickbloxConfig,
  createSession,
  getGroupMessages,
};
