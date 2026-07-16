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
    <>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <form className="message-input-bar" onSubmit={handleSubmit} aria-label="Enviar mensaje">
        <label htmlFor="message-text" style={{ display: "none" }}>
          Mensaje
        </label>
        <input
          id="message-text"
          name="text"
          type="text"
          placeholder="Escribe un mensaje..."
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={VALIDATION.MESSAGE_MAX_LENGTH}
          disabled={disabled}
          autoComplete="off"
        />
        <button type="submit" disabled={disabled} aria-label="Enviar">
          ➤
        </button>
      </form>
    </>
  );
}
