import { useEffect, useRef, useState, type FormEvent } from "react";
import { VALIDATION } from "@realtime-chat/shared";

export interface CreateRoomModalProps {
  open: boolean;
  submitting?: boolean;
  error?: string | null;
  onCreate: (name: string, isPrivate: boolean) => void;
  onClose: () => void;
}

export function CreateRoomModal({ open, submitting, error, onCreate, onClose }: CreateRoomModalProps) {
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < VALIDATION.ROOM_NAME_MIN_LENGTH || submitting) return;
    onCreate(trimmed, isPrivate);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-room-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="create-room-title">Crear sala</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="create-room-name">Nombre de la sala</label>
          <input
            id="create-room-name"
            ref={inputRef}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={VALIDATION.ROOM_NAME_MIN_LENGTH}
            maxLength={VALIDATION.ROOM_NAME_MAX_LENGTH}
            disabled={submitting}
            autoComplete="off"
            placeholder="Ej. Tecnología"
          />
          <label className="create-room-modal__private-toggle">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(event) => setIsPrivate(event.target.checked)}
              disabled={submitting}
            />
            Sala privada (solo tú apruebas quién entra)
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="modal-dialog__actions">
            <button type="button" className="chat-button chat-button--ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="chat-button" disabled={submitting}>
              {submitting ? "Creando..." : "Crear sala"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
