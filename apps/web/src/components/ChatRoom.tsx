import type { ChatMessage, PublicUser } from "@realtime-chat/shared";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { UserList } from "./UserList";

export interface ChatRoomProps {
  currentUser: PublicUser;
  users: PublicUser[];
  messages: ChatMessage[];
  sendError?: string | null;
  historyLoading?: boolean;
  historyError?: string | null;
  hasMoreHistory?: boolean;
  disabled?: boolean;
  onSend: (text: string, imageData?: string) => void;
  onLoadMoreHistory?: () => void;
}

export function ChatRoom({
  currentUser,
  users,
  messages,
  sendError,
  historyLoading,
  historyError,
  hasMoreHistory,
  disabled,
  onSend,
  onLoadMoreHistory,
}: ChatRoomProps) {
  return (
    <section className="chat-room" aria-label="Sala de chat">
      <UserList users={users} currentUserId={currentUser.id} />
      <MessageList
        messages={messages}
        currentUserId={currentUser.guestUserId}
        hasMoreHistory={hasMoreHistory}
        historyLoading={historyLoading}
        historyError={historyError}
        onLoadMore={onLoadMoreHistory}
      />
      <MessageInput onSend={onSend} error={sendError} disabled={disabled} />
    </section>
  );
}
