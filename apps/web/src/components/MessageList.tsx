import type { ChatMessage } from "@realtime-chat/shared";

export interface MessageListProps {
  messages: ChatMessage[];
  currentUserId?: string | null;
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  if (messages.length === 0) {
    return <p>Todavía no hay mensajes.</p>;
  }

  return (
    <ul aria-label="Mensajes">
      {messages.map((message) => (
        <li key={message.id} data-own={message.authorId === currentUserId}>
          <strong>{message.authorName}</strong>: {message.text}
        </li>
      ))}
    </ul>
  );
}
