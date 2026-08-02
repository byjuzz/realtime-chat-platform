import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { VALIDATION } from "@realtime-chat/shared";

export interface MessageInputProps {
  onSend: (text: string, imageData?: string) => void;
  error?: string | null;
  disabled?: boolean;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function MessageInput({ onSend, error, disabled }: MessageInputProps) {
  const [text, setText] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setImageError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > VALIDATION.IMAGE_DATA_URL_MAX_LENGTH) {
        setImageError("La imagen es demasiado pesada (máximo ~1.5MB).");
        return;
      }
      setImageData(dataUrl);
    } catch {
      setImageError("No se pudo leer la imagen.");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0 && !imageData) return;
    onSend(trimmed, imageData ?? undefined);
    setText("");
    setImageData(null);
  }

  return (
    <>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {imageError ? (
        <p className="inline-error" role="alert">
          {imageError}
        </p>
      ) : null}
      {imageData ? (
        <div className="message-input-bar__preview">
          <img src={imageData} alt="Vista previa de la imagen a enviar" />
          <button type="button" onClick={() => setImageData(null)} aria-label="Quitar imagen">
            ✕
          </button>
        </div>
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={handleFileChange}
          disabled={disabled}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Adjuntar imagen"
        >
          📎
        </button>
        <button type="submit" disabled={disabled} aria-label="Enviar">
          ➤
        </button>
      </form>
    </>
  );
}
