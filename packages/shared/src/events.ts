/**
 * Contrato de eventos Socket.IO compartido entre apps/web y apps/api.
 *
 * `connect_error` NO se declara aquí: es un evento nativo del cliente de
 * Socket.IO (se escucha con `socket.on("connect_error", ...)`), no un
 * evento de aplicación definido en ServerToClientEvents.
 */

// --- Constantes de validación ---

export const VALIDATION = {
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 24,
  MESSAGE_MAX_LENGTH: 500,
  RATE_LIMIT_WINDOW_MS: 3000,
  RATE_LIMIT_MAX_MESSAGES: 5,
} as const;

// --- Modelos ---

export interface PublicUser {
  id: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  ts: number;
}

// --- Códigos de error ---

export type ErrorCode =
  | "INVALID_NAME"
  | "ALREADY_JOINED"
  | "NOT_JOINED"
  | "EMPTY_MESSAGE"
  | "MESSAGE_TOO_LONG"
  | "RATE_LIMITED";

export interface ErrorResponse {
  ok: false;
  code: ErrorCode;
  message: string;
}

export interface SuccessResponse<T> {
  ok: true;
  data: T;
}

export type AckResponse<T> = SuccessResponse<T> | ErrorResponse;

export type JoinAck = AckResponse<{ user: PublicUser }>;
export type MessageAck = AckResponse<{ message: ChatMessage }>;

// --- Payloads entrantes (cliente -> servidor) ---

export interface UserJoinPayload {
  name: string;
}

export interface MessageSendPayload {
  text: string;
}

// --- Eventos ---

export interface ClientToServerEvents {
  "user:join": (payload: UserJoinPayload, ack: (response: JoinAck) => void) => void;
  "message:send": (payload: MessageSendPayload, ack: (response: MessageAck) => void) => void;
}

export interface ServerToClientEvents {
  "user:joined": (user: PublicUser) => void;
  "user:left": (user: PublicUser) => void;
  "user:list": (payload: { users: PublicUser[] }) => void;
  "message:new": (message: ChatMessage) => void;
}
