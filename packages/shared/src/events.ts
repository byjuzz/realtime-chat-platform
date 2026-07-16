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
  id: string; // socket.id: identidad de PRESENCIA, por conexión
  name: string;
  guestUserId: string; // GuestUser.id: identidad PERSISTENTE, ver ADR-004
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
  | "RATE_LIMITED"
  | "MESSAGE_PERSISTENCE_FAILED";

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

// --- Historial de mensajes (REST) ---

export interface MessageHistoryResponse {
  room: { slug: string; name: string };
  messages: ChatMessage[]; // orden cronológico ascendente
  nextCursor: string | null;
  hasMore: boolean;
}

// --- Payloads entrantes (cliente -> servidor) ---

export interface UserJoinPayload {
  name: string;
  guestUserId?: string; // ausente en la primera visita del navegador
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
