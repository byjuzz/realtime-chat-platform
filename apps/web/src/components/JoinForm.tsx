import { useState, type FormEvent } from "react";
import { VALIDATION } from "@realtime-chat/shared";

export interface JoinFormProps {
  onJoin: (name: string) => void;
  error?: string | null;
  submitting?: boolean;
}

export function JoinForm({ onJoin, error, submitting }: JoinFormProps) {
  const [name, setName] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < VALIDATION.NAME_MIN_LENGTH) return;
    onJoin(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Unirse al chat">
      <label htmlFor="join-name">Tu nombre</label>
      <input
        id="join-name"
        name="name"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        minLength={VALIDATION.NAME_MIN_LENGTH}
        maxLength={VALIDATION.NAME_MAX_LENGTH}
        disabled={submitting}
        autoComplete="off"
      />
      <button type="submit" disabled={submitting}>
        Entrar al chat
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
