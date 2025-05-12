type QuickBloxChatGroupType = {
  _id: string;
  data: {
    className: string;
    branchId: string;
    branchName: string;
    isAuto: boolean;
    isAnnouncement: boolean;
    primaryUserPsId?: string;
  };
  name: string;
  photo: string;
  type: number;
  occupants_ids: number[];
  user_id: number;
  created_at: string;
  last_message: string;
  last_message_date_sent: number;
  last_message_id: string;
  last_message_user_id: number;
  updated_at: string;
  xmpp_room_jid: string;
  unread_messages_count: number;
};

type QuickBloxMessageType = {
  _id: string;
  attachments: { type: string; id: string }[];
  chat_dialog_id: string;
  created_at: string;
  customSenderId: string;
  date_sent: number;
  delivered_ids: number[];
  markable: string;
  message: string;
  messageType: string;
  read_ids: number[];
  recipient_id: number;
  all_read: boolean;
  sender_id: number;
  updated_at: string;
  read: number;
};

export { QuickBloxChatGroupType, QuickBloxMessageType };
