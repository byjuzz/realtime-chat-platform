import { useState, type FormEvent } from "react";
import { VALIDATION } from "@realtime-chat/shared";

export interface MessageInputProps {
  onSend: (text: string) => void;
  error?: string | null;
  disabled?: boolean;
}

export function MessageInput({ onSend, error, disabled }: MessageInputProps) {
  const [text, setText] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Enviar mensaje">
      <label htmlFor="message-text">Mensaje</label>
      <input
        id="message-text"
        name="text"
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={VALIDATION.MESSAGE_MAX_LENGTH}
        disabled={disabled}
        autoComplete="off"
      />
      <button type="submit" disabled={disabled}>
        Enviar
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
