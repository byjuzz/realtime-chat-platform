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
