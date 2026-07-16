import { VALIDATION, type ErrorResponse } from "./events.js";

export type ValidationResult<T> = { valid: true; value: T } | { valid: false; error: ErrorResponse };

export function validateName(rawName: unknown): ValidationResult<string> {
  if (typeof rawName !== "string") {
    return {
      valid: false,
      error: { ok: false, code: "INVALID_NAME", message: "El nombre es obligatorio." },
    };
  }
  const name = rawName.trim();
  if (name.length < VALIDATION.NAME_MIN_LENGTH || name.length > VALIDATION.NAME_MAX_LENGTH) {
    return {
      valid: false,
      error: {
        ok: false,
        code: "INVALID_NAME",
        message: `El nombre debe tener entre ${VALIDATION.NAME_MIN_LENGTH} y ${VALIDATION.NAME_MAX_LENGTH} caracteres.`,
      },
    };
  }
  return { valid: true, value: name };
}

export function validateRoomName(rawName: unknown): ValidationResult<string> {
  if (typeof rawName !== "string") {
    return {
      valid: false,
      error: { ok: false, code: "INVALID_ROOM_NAME", message: "El nombre de la sala es obligatorio." },
    };
  }
  const name = rawName.trim();
  if (
    name.length < VALIDATION.ROOM_NAME_MIN_LENGTH ||
    name.length > VALIDATION.ROOM_NAME_MAX_LENGTH
  ) {
    return {
      valid: false,
      error: {
        ok: false,
        code: "INVALID_ROOM_NAME",
        message: `El nombre de la sala debe tener entre ${VALIDATION.ROOM_NAME_MIN_LENGTH} y ${VALIDATION.ROOM_NAME_MAX_LENGTH} caracteres.`,
      },
    };
  }
  if (slugifyRoomName(name).length === 0) {
    return {
      valid: false,
      error: {
        ok: false,
        code: "INVALID_ROOM_NAME",
        message: "El nombre de la sala debe incluir al menos una letra o número.",
      },
    };
  }
  return { valid: true, value: name };
}

/** Convierte un nombre de sala en un slug URL-safe. Determinista y pura. */
export function slugifyRoomName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos/diacríticos (rango Unicode explícito)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, VALIDATION.ROOM_SLUG_MAX_LENGTH);
}

export function validateMessageText(rawText: unknown): ValidationResult<string> {
  if (typeof rawText !== "string") {
    return {
      valid: false,
      error: { ok: false, code: "EMPTY_MESSAGE", message: "El mensaje es obligatorio." },
    };
  }
  const text = rawText.trim();
  if (text.length === 0) {
    return {
      valid: false,
      error: { ok: false, code: "EMPTY_MESSAGE", message: "El mensaje no puede estar vacío." },
    };
  }
  if (text.length > VALIDATION.MESSAGE_MAX_LENGTH) {
    return {
      valid: false,
      error: {
        ok: false,
        code: "MESSAGE_TOO_LONG",
        message: `El mensaje no puede superar ${VALIDATION.MESSAGE_MAX_LENGTH} caracteres.`,
      },
    };
  }
  return { valid: true, value: text };
}
