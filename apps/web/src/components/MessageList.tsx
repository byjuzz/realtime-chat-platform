import { useEffect, useRef } from "react";
import type { ChatMessage } from "@realtime-chat/shared";

export interface MessageListProps {
  messages: ChatMessage[];
  currentUserId?: string | null;
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  const bottomRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <ul className="message-list" aria-label="Mensajes">
        <li className="message-list__empty">Todavía no hay mensajes.</li>
      </ul>
    );
  }

  return (
    <ul className="message-list" aria-label="Mensajes">
      {messages.map((message) => {
        const isOwn = message.authorId === currentUserId;
        return (
          <li key={message.id} className="message-row" data-own={isOwn}>
            <div className="message-bubble">
              {!isOwn && <span className="message-bubble__author">{message.authorName}</span>}
              {message.text}
            </div>
          </li>
        );
      })}
      <li ref={bottomRef} aria-hidden="true" />
    </ul>
  );
}
