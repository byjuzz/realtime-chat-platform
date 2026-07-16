import type { ChatMessage, PublicUser } from "@realtime-chat/shared";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { UserList } from "./UserList";

export interface ChatRoomProps {
  currentUser: PublicUser;
  users: PublicUser[];
  messages: ChatMessage[];
  sendError?: string | null;
  onSend: (text: string) => void;
}

export function ChatRoom({ currentUser, users, messages, sendError, onSend }: ChatRoomProps) {
  return (
    <section className="chat-room" aria-label="Sala de chat">
      <UserList users={users} currentUserId={currentUser.id} />
      <MessageList messages={messages} currentUserId={currentUser.id} />
      <MessageInput onSend={onSend} error={sendError} />
    </section>
  );
}
