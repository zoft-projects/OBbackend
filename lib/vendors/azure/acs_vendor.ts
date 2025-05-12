import { ChatClient, ChatParticipant, ChatThreadClient, CreateChatThreadResult } from '@azure/communication-chat';

import {
  AzureCommunicationTokenCredential,
  CommunicationUserIdentifier,
  CommunicationTokenRefreshOptions,
} from '@azure/communication-common';
import { CommunicationAccessToken, CommunicationIdentityClient, GetTokenOptions } from '@azure/communication-identity';
import { AccessToken } from '@azure/core-auth';
import config from 'config';
import { logError, logInfo, logWarn } from '../../log/util';
import { ChatGroupParticipantType } from '../../types';
import { getSecret } from '../aws/secret_manager';

const { secretKeyName }: { secretKeyName: string } = config.get('Services.azure');
const { acsEndpoint, tokenExpiresInMinutes }: { acsEndpoint: string; tokenExpiresInMinutes: number } =
  config.get('Features.chat');

// Cache the identity client after first initialization
let cachedIdentityAdapter: CommunicationIdentityClient | null = null;

// Connect to ACS using a connection string from config/secrets.
const connectToACS = async (): Promise<CommunicationIdentityClient> => {
  try {
    logInfo('[ACS] Connecting to Azure Communication Services...');

    if (cachedIdentityAdapter) {
      logInfo('[ACS] Using cached CommunicationIdentityClient instance.');

      return cachedIdentityAdapter;
    }
    const connectionString = await getSecret(secretKeyName);

    if (!connectionString) {
      throw new Error(`[ACS] Connection string not found for key: ${secretKeyName}`);
    }

    cachedIdentityAdapter = new CommunicationIdentityClient(connectionString);
    logInfo('[ACS] Successfully connected to Azure Communication Services.');

    return cachedIdentityAdapter;
  } catch (error) {
    logError(`[ACS] Error connecting to Azure Communication Services: ${error.message}`);
    throw error;
  }
};

// Create a new ACS user identity.
const createNewAcsUser = async (transactionId: string): Promise<CommunicationUserIdentifier> => {
  try {
    logInfo(`[${transactionId}] [VENDOR] [ACS] [createNewAcsUser] Creating a new ACS user identity...`);

    const identityAdapter = await connectToACS();

    const newUser: CommunicationUserIdentifier = await identityAdapter.createUser();

    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [createNewAcsUser] Successfully created ACS user with ID: ${newUser.communicationUserId}`,
    );

    return newUser;
  } catch (error) {
    logError(`[${transactionId}] [VENDOR] [ACS] [createNewAcsUser] Failed to create ACS user: ${error.message}`);
    throw error;
  }
};

// Remove an ACS user identity.
const removeAcsUser = async (transactionId: string, communicationUserId: string): Promise<void> => {
  try {
    logInfo(`[${transactionId}] [VENDOR] [ACS] [removeAcsUser] Removing ACS user with ID: ${communicationUserId}`);

    const identityAdapter = await connectToACS();

    await identityAdapter.deleteUser({ communicationUserId });

    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [removeAcsUser] Successfully removed ACS user with ID: ${communicationUserId}`,
    );
  } catch (error) {
    logError(`[${transactionId}] [VENDOR] [ACS] [removeAcsUser] Failed to remove ACS user: ${error.message}`);
    throw error;
  }
};

const getValidAcsAccessToken = async (transactionId: string, token: string): Promise<CommunicationAccessToken> => {
  try {
    // Create a token credential
    const tokenCredential = createTokenCredential(transactionId, token);

    // Retrieve the access token using the token credential
    const accessToken: AccessToken = await tokenCredential.getToken();

    if (!accessToken) {
      throw new Error('Failed to retrieve communication access token: Token is null or undefined.');
    }

    return {
      token: accessToken.token,
      expiresOn: new Date(accessToken.expiresOnTimestamp),
    };
  } catch (error) {
    // Log and rethrow the error for higher-level handling
    logError(
      `[${transactionId}] [VENDOR] [ACS] [getValidAcsAccessToken] Failed to generating user access token for transactionId: ${transactionId}. Details: ${error.message}`,
    );
    throw error;
  }
};

// Create a token credential that automatically handles token validation and refresh.
const createTokenCredential = (transactionId: string, initialToken: string): AzureCommunicationTokenCredential => {
  const fetchNewToken = async (): Promise<string> => {
    const { token } = await getAcsUserNewAccessToken(transactionId, initialToken);

    return token;
  };
  const tokenRefreshOptions: CommunicationTokenRefreshOptions = {
    tokenRefresher: fetchNewToken,
    refreshProactively: true,
  };

  return new AzureCommunicationTokenCredential({
    token: initialToken,
    ...tokenRefreshOptions,
  });
};

// Initialize the chat client.
const initializeGroupAdapter = async (
  transactionId: string,
  rootCommunicationUserId: string,
  rootUserToken: string,
): Promise<ChatClient> => {
  logInfo(`[${transactionId}] [initializeGroupAdapter] Initializing chat client...`);
  const endpoint = acsEndpoint;

  if (!rootCommunicationUserId || !rootUserToken) {
    logError(`[${transactionId}][initializeGroupAdapter] rootUserToken or rootCommunicationUserId not found`);
    throw new Error('ACS rootUserToken or rootCommunicationUserId not found');
  }

  const credential = createTokenCredential(transactionId, rootUserToken);

  const groupAdapter = new ChatClient(endpoint, credential);
  logInfo(`[${transactionId}] [initializeGroupAdapter] Chat client initialized successfully`);

  return groupAdapter;
};

// Get an access token for the specified ACS user.
const getAcsUserNewAccessToken = async (
  transactionId: string,
  communicationUserId: string,
): Promise<CommunicationAccessToken> => {
  try {
    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [getAcsUserNewAccessToken] Retrieving access token for ACS user Id: ${communicationUserId}`,
    );

    if (!communicationUserId) {
      throw new Error('CommunicationUserId is required to get the ACS user access token.');
    }

    const identityClient = await connectToACS();

    const user: CommunicationUserIdentifier = { communicationUserId };
    const tokenOptions: GetTokenOptions = { tokenExpiresInMinutes };

    const tokenResponse: CommunicationAccessToken = await identityClient.getToken(user, ['chat'], tokenOptions);

    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [getAcsUserNewAccessToken] Successfully retrieved token for ACS user id: ${user.communicationUserId}`,
    );

    return tokenResponse;
  } catch (error) {
    logError(
      `[${transactionId}] [VENDOR] [ACS] [getAcsUserNewAccessToken] Failed to retrieve token for ACS user Id (${communicationUserId}): ${error.message}`,
    );
    throw error;
  }
};

// Revoke all tokens for the specified ACS user
const revokeAcsUserToken = async (transactionId: string, user: CommunicationUserIdentifier): Promise<void> => {
  try {
    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [revokeAcsUserToken] Revoking all tokens for ACS user: ${user.communicationUserId}`,
    );

    const identityClient = await connectToACS();

    await identityClient.revokeTokens(user);

    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [revokeAcsUserToken] Successfully revoked tokens for ACS user: ${user.communicationUserId}`,
    );
  } catch (error) {
    logError(
      `[${transactionId}] [VENDOR] [ACS] [revokeAcsUserToken] Failed to revoke tokens for ACS user (${user.communicationUserId}): ${error.message}`,
    );
    throw error;
  }
};

// Create a chat group with topic and participants (optional).
const createAcsChatGroup = async (
  transactionId: string,
  rootCommunicationUserId: string,
  rootUserToken: string,
  groupName: string,
  participants?: ChatGroupParticipantType[],
): Promise<CreateChatThreadResult> => {
  try {
    logInfo(`[${transactionId}] [VENDOR] [ACS] [createAcsChatGroup] Creating new chat group with name: "${groupName}"`);

    const groupAdapter: ChatClient = await initializeGroupAdapter(
      transactionId,
      rootCommunicationUserId,
      rootUserToken,
    );

    const chatParticipants: ChatParticipant[] = [];

    participants?.forEach(({ vendorUserId, displayName }) => {
      chatParticipants.push({
        id: { communicationUserId: vendorUserId },
        displayName,
      });
    });

    if (!Array.isArray(participants) || participants.length === 0) {
      logWarn(
        `[${transactionId}] [VENDOR] [ACS] [createAcsChatGroup] No participants provided for group: ${groupName}`,
      );
    }

    const result: CreateChatThreadResult = await groupAdapter.createChatThread(
      {
        topic: groupName,
      },
      {
        participants: chatParticipants,
      },
    );

    const vendorGroupId = result.chatThread?.id;

    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [createAcsChatGroup] Successfully created group with ID: ${vendorGroupId}`,
    );

    return result;
  } catch (error) {
    logError(`[${transactionId}] [VENDOR] [ACS] [createAcsChatGroup] Failed to create chat group: ${error.message}`);
    throw error;
  }
};

// Update the topic of a chat group, ACS only supports updating the topic.
const updateAcsChatGroupName = async (
  transactionId: string,
  rootCommunicationUserId: string,
  rootUserToken: string,
  vendorGroupId: string,
  groupName: string,
): Promise<void> => {
  try {
    logInfo(`[${transactionId}] [VENDOR] [ACS] [updateAcsChatTopic] Updating chat group with ID: ${vendorGroupId}`);

    const chatGroupClient: ChatThreadClient = await initializeGroupManager(
      transactionId,
      vendorGroupId,
      rootCommunicationUserId,
      rootUserToken,
    );

    await chatGroupClient.updateTopic(groupName);

    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [updateAcsChatTopic] Successfully updated group with ID: ${vendorGroupId}`,
    );
  } catch (error) {
    logError(`[${transactionId}] [VENDOR] [ACS] [updateAcsChatTopic] Failed to update chat group: ${error.message}`);
    throw error;
  }
};

// Delete a chat vendorGroupId by ID.
const removeAcsChatGroup = async (
  transactionId: string,
  rootCommunicationUserId: string,
  rootUserToken: string,
  vendorGroupId: string,
): Promise<void> => {
  try {
    const chatClient = await initializeGroupAdapter(transactionId, rootCommunicationUserId, rootUserToken);

    logInfo(`[${transactionId}] [VENDOR] [ACS] [removeAcsChatGroup] Removing chat group with ID: ${vendorGroupId}`);
    await chatClient.deleteChatThread(vendorGroupId);
    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [removeAcsChatGroup] Successfully removed chat group with ID: ${vendorGroupId}`,
    );
  } catch (error) {
    logError(
      `[${transactionId}] [VENDOR] [ACS] [removeAcsChatGroup] Failed to remove chat group (${vendorGroupId}): ${error.message}`,
    );
    throw error;
  }
};

// Initialize a chat thread client
const initializeGroupManager = async (
  transactionId: string,
  vendorGroupId: string,
  rootCommunicationUserId: string,
  rootUserToken: string,
): Promise<ChatThreadClient> => {
  logInfo(`[${transactionId}] [initializeGroupManager] Initializing chat manager`);

  const groupAdapter = await initializeGroupAdapter(transactionId, rootCommunicationUserId, rootUserToken);

  const chatGroupClient = groupAdapter.getChatThreadClient(vendorGroupId);
  logInfo(`[${transactionId}] [initializeGroupManager] Chat manager initialized successfully`);

  return chatGroupClient;
};

// Add users to a chat group.
const addAcsChatGroupParticipants = async (
  transactionId: string,
  vendorGroupId: string,
  { rootCommunicationUserId, rootUserToken }: { rootCommunicationUserId: string; rootUserToken: string },
  users: ChatGroupParticipantType[],
  shareMessagesSince?: Date,
): Promise<ChatGroupParticipantType[]> => {
  try {
    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [addAcsChatGroupParticipants] Starting process for vendorGroupId: ${vendorGroupId}`,
    );

    if (!Array.isArray(users) || users.length === 0) {
      throw new Error('No participants provided to add.');
    }

    const validParticipants = users.filter(({ vendorUserId }) => Boolean(vendorUserId));

    if (validParticipants.length === 0) {
      logWarn(`[${transactionId}] [VENDOR] [ACS] No valid vendorUserId found among provided participants.`);
      throw new Error('No valid participants to add.');
    }

    const existGroupParticipants = await listAcsChatGroupParticipants(
      transactionId,
      vendorGroupId,
      rootCommunicationUserId,
      rootUserToken,
    );

    const existParticipantIds = new Set(
      existGroupParticipants.map((participant) => (participant.id as CommunicationUserIdentifier).communicationUserId),
    );

    const participantsToAdd = validParticipants.filter(({ vendorUserId }) => !existParticipantIds.has(vendorUserId));

    if (participantsToAdd.length === 0) {
      logInfo(
        `[${transactionId}] [VENDOR] [ACS] All provided participants are already part of the group. No new users to add.`,
      );

      return [];
    }

    const chatGroupClient = await initializeGroupManager(
      transactionId,
      vendorGroupId,
      rootCommunicationUserId,
      rootUserToken,
    );

    const participants: ChatParticipant[] = participantsToAdd.map(({ vendorUserId, displayName }) => ({
      id: { communicationUserId: vendorUserId },
      displayName,
      shareHistoryTime: shareMessagesSince,
    }));

    const acsAddedResult = await chatGroupClient.addParticipants({ participants });

    logInfo(
      `[${transactionId}] [VENDOR] [ACS] Successfully added ${participantsToAdd.length} participant(s) to vendorGroupId: ${vendorGroupId}`,
    );
    logInfo(`[${transactionId}] [VENDOR] [ACS] addParticipants result: ${JSON.stringify(acsAddedResult)}`);

    return participantsToAdd;
  } catch (err: any) {
    logError(`[${transactionId}] [VENDOR] [ACS] Failed to add participants: ${err.message}`);
    throw err;
  }
};

const removeAcsChatGroupParticipants = async (
  transactionId: string,
  vendorGroupId: string,
  rootCommunicationUserId: string,
  rootUserToken: string,
  vendorUserIds: string[],
): Promise<string[]> => {
  try {
    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [removeAcsChatGroupParticipants] Starting removal for vendorGroupId: ${vendorGroupId}`,
    );

    if (!Array.isArray(vendorUserIds) || vendorUserIds.length === 0) {
      throw new Error('No participants provided to remove.');
    }

    const existGroupParticipants = await listAcsChatGroupParticipants(
      transactionId,
      vendorGroupId,
      rootCommunicationUserId,
      rootUserToken,
    );

    const existParticipantIds = new Set(
      existGroupParticipants.map((participant) => (participant.id as CommunicationUserIdentifier).communicationUserId),
    );

    const usersToRemove = vendorUserIds.filter((id) => existParticipantIds.has(id));

    if (usersToRemove.length === 0) {
      logInfo(
        `[${transactionId}] [VENDOR] [ACS] No matching participants found to remove in vendorGroupId: ${vendorGroupId}`,
      );

      return [];
    }

    const chatGroupClient = await initializeGroupManager(
      transactionId,
      vendorGroupId,
      rootCommunicationUserId,
      rootUserToken,
    );

    const successVendorUserIds: string[] = [];
    const failedVendorUserIds: string[] = [];

    for (const userId of usersToRemove) {
      try {
        await chatGroupClient.removeParticipant({ communicationUserId: userId });
        successVendorUserIds.push(userId);
      } catch (err: any) {
        logError(`[${transactionId}] [VENDOR] [ACS] Failed to remove ${userId}: ${err.message}`);
        failedVendorUserIds.push(userId);
      }
    }

    if (failedVendorUserIds.length > 0) {
      logWarn(
        `[${transactionId}] [VENDOR] [ACS] Failed to remove participants: ${JSON.stringify(failedVendorUserIds)}`,
      );
    }

    logInfo(
      `[${transactionId}] [VENDOR] [ACS] Successfully removed ${successVendorUserIds.length} participant(s) from vendorGroupId: ${vendorGroupId}`,
    );

    return successVendorUserIds;
  } catch (err: any) {
    logError(`[${transactionId}] [VENDOR] [ACS] Error during participant removal: ${err.message}`);
    throw err;
  }
};

const listAcsChatGroupParticipants = async (
  transactionId: string,
  vendorGroupId: string,
  rootCommunicationUserId: string,
  rootUserToken: string,
): Promise<ChatParticipant[]> => {
  try {
    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [listAcsChatGroupParticipants] Initializing chat group adapter for vendorGroupId: ${vendorGroupId}`,
    );

    const chatGroupClient: ChatThreadClient = await initializeGroupManager(
      transactionId,
      vendorGroupId,
      rootCommunicationUserId,
      rootUserToken,
    );

    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [listAcsChatGroupParticipants] Listing participants for vendorGroupId: ${vendorGroupId}`,
    );

    const listingIterator = chatGroupClient.listParticipants();

    const participants: ChatParticipant[] = [];
    let loopCounter = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (loopCounter > 250) {
        break;
      }

      loopCounter += 1;

      const page = await listingIterator.next();

      if (page.done) {
        logInfo(
          `[${transactionId}] [VENDOR] [ACS] [listAcsChatGroupParticipants] No more participants to list for vendorGroupId: ${vendorGroupId}`,
        );

        break;
      }

      if (Array.isArray(page.value)) {
        page.value.forEach((participant: ChatParticipant) => {
          participants.push({
            id: participant.id,
            displayName: participant.displayName,
            shareHistoryTime: participant.shareHistoryTime,
          });
        });

        logInfo(
          `[${transactionId}] [VENDOR] [ACS] [listAcsChatGroupParticipants] Pagination successful for vendorGroupId: ${vendorGroupId}, list size: ${page.value.length}`,
        );
      } else if (typeof page.value === 'object') {
        participants.push(page.value as ChatParticipant);
      } else {
        logWarn(
          `[${transactionId}] [VENDOR] [ACS] [listAcsChatGroupParticipants] value issue, received: ${JSON.stringify(
            page.value,
          )}`,
        );
        break;
      }
    }

    logInfo(
      `[${transactionId}] [VENDOR] [ACS] [listAcsChatGroupParticipants] Successfully listed participants for vendorGroupId: ${vendorGroupId}, total size: ${participants.length}`,
    );

    return participants;
  } catch (error) {
    logError(
      `[${transactionId}] [VENDOR] [ACS] [listAcsChatGroupParticipants] Failed to list participants for vendorGroupId: ${vendorGroupId}. Error: ${JSON.stringify(
        error.message,
      )}`,
    );

    throw error;
  }
};

export {
  connectToACS,
  createNewAcsUser,
  removeAcsUser,
  getAcsUserNewAccessToken,
  getValidAcsAccessToken,
  createAcsChatGroup,
  removeAcsChatGroup,
  revokeAcsUserToken,
  addAcsChatGroupParticipants,
  removeAcsChatGroupParticipants,
  updateAcsChatGroupName,
  listAcsChatGroupParticipants,
};
