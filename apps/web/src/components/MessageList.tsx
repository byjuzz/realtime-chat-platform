import { useEffect, useRef } from "react";
import type { ChatMessage } from "@realtime-chat/shared";

export interface MessageListProps {
  messages: ChatMessage[];
  currentUserId?: string | null;
  hasMoreHistory?: boolean;
  historyLoading?: boolean;
  historyError?: string | null;
  onLoadMore?: () => void;
}

export function MessageList({
  messages,
  currentUserId,
  hasMoreHistory,
  historyLoading,
  historyError,
  onLoadMore,
}: MessageListProps) {
  const bottomRef = useRef<HTMLLIElement>(null);
  const lastMessageId = messages[messages.length - 1]?.id;

  // Se dispara al llegar un mensaje nuevo al final (propio o ajeno), no al
  // anteponer historial anterior con "cargar mensajes anteriores".
  useEffect(() => {
    if (!lastMessageId) return;
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [lastMessageId]);

  return (
    <ul className="message-list" aria-label="Mensajes">
      {hasMoreHistory ? (
        <li className="message-list__load-more">
          <button type="button" onClick={onLoadMore} disabled={historyLoading}>
            {historyLoading ? "Cargando..." : "Cargar mensajes anteriores"}
          </button>
        </li>
      ) : null}
      {historyError ? (
        <li className="message-list__history-error" role="alert">
          {historyError}
        </li>
      ) : null}
      {messages.length === 0 && !historyLoading ? (
        <li className="message-list__empty">Todavía no hay mensajes.</li>
      ) : null}
      {messages.map((message) => {
        const isOwn = message.authorId === currentUserId;
        return (
          <li key={message.id} className="message-row" data-own={isOwn}>
            <div className="message-bubble">
              {!isOwn && <span className="message-bubble__author">{message.authorName}</span>}
              {message.imageData ? <img className="message-bubble__image" src={message.imageData} alt="Imagen enviada en el chat" /> : null}
              {message.text}
            </div>
          </li>
        );
      })}
      <li ref={bottomRef} aria-hidden="true" />
    </ul>
  );
}
