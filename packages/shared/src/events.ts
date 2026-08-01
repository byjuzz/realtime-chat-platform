/**
 * Contrato de eventos Socket.IO compartido entre apps/web y apps/api.
 *
 * `connect_error` NO se declara aquí: es un evento nativo del cliente de
 * Socket.IO (se escucha con `socket.on("connect_error", ...)`), no un
 * evento de aplicación definido en ServerToClientEvents.
 *
 * Fase 4: se reemplazan por completo los eventos de una sola sala
 * (`user:join`, `user:joined`, `user:left`, `user:list`) por eventos con
 * contexto de sala (`room:join`, `room:leave`, `room:joined`, `room:left`,
 * `room:users`). No se mantienen alias de compatibilidad — ver ADR-005.
 */

// --- Constantes de validación ---

export const VALIDATION = {
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 24,
  MESSAGE_MAX_LENGTH: 500,
  RATE_LIMIT_WINDOW_MS: 3000,
  RATE_LIMIT_MAX_MESSAGES: 5,
  ROOM_NAME_MIN_LENGTH: 2,
  ROOM_NAME_MAX_LENGTH: 60,
  ROOM_SLUG_MAX_LENGTH: 60,
  /** Tiempo máximo que una solicitud de ingreso a una sala privada espera aprobación del creador antes de expirar. */
  JOIN_REQUEST_TTL_MS: 60_000,
  /**
   * Prototipo de imágenes: tamaño máximo del data URL base64 (~1.5MB de
   * imagen real, la codificación base64 agrega ~33% de overhead). Guardado
   * directo en la fila del mensaje — no apto para producción.
   */
  IMAGE_DATA_URL_MAX_LENGTH: 2_000_000,
} as const;

/** Slugs que ninguna sala creada por usuarios puede usar. */
export const RESERVED_ROOM_SLUGS = ["api", "health", "ready", "admin", "socket.io", "general"] as const;

// --- Modelos ---

export interface PublicUser {
  /**
   * Identidad PERSISTENTE consolidada (GuestUser.id). Un mismo guestUserId
   * puede tener varios sockets (varias pestañas); la presencia se muestra
   * consolidada por este id, no por socket.id. Ver ADR-004 y ADR-005.
   */
  id: string;
  name: string;
  guestUserId: string;
}

export interface ChatMessage {
  id: string;
  roomId: string; // identificador canónico de la sala, no el slug (más estable)
  authorId: string;
  authorName: string;
  text: string;
  /** Prototipo: data URL base64 (p. ej. "data:image/png;base64,..."), opcional. */
  imageData?: string | null;
  ts: number;
}

export interface PublicRoom {
  id: string;
  name: string;
  slug: string;
  createdAt: number; // epoch ms
  isPrivate: boolean;
  /** guestUserId de quien creó la sala, o null para salas sin creador (p. ej. "general"). */
  creatorId: string | null;
  /** Conteo de guestUserId distintos conectados ahora mismo, en memoria. */
  connectedUsers?: number;
}

// --- Códigos de error ---

export type ErrorCode =
  | "INVALID_NAME"
  | "INVALID_ROOM_NAME"
  | "NOT_JOINED"
  | "EMPTY_MESSAGE"
  | "MESSAGE_TOO_LONG"
  | "RATE_LIMITED"
  | "MESSAGE_PERSISTENCE_FAILED"
  | "ROOM_NOT_FOUND"
  | "ROOM_SLUG_CONFLICT"
  | "GUEST_IDENTITY_REQUIRED"
  | "JOIN_PENDING_APPROVAL"
  | "JOIN_REJECTED"
  | "JOIN_EXPIRED"
  | "JOIN_REQUEST_NOT_FOUND"
  | "NOT_ROOM_CREATOR"
  | "INVALID_IMAGE"
  | "IMAGE_TOO_LARGE";

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

export type MessageAck = AckResponse<{ message: ChatMessage }>;

// --- Historial de mensajes (REST) ---

export interface MessageHistoryResponse {
  room: { slug: string; name: string };
  messages: ChatMessage[]; // orden cronológico ascendente
  nextCursor: string | null;
  hasMore: boolean;
}

// --- Salas (REST) ---

export interface RoomListResponse {
  rooms: PublicRoom[];
}

export interface CreateRoomRequest {
  name: string;
  isPrivate?: boolean;
  /** Requerido si isPrivate es true: quien crea la sala queda como su único aprobador. */
  guestUserId?: string;
}

export interface CreateRoomResponse {
  room: PublicRoom;
}

// --- Payloads Socket.IO (cliente -> servidor) ---

export interface RoomJoinPayload {
  name: string;
  guestUserId?: string; // ausente en la primera visita del navegador
  roomSlug: string;
}

export interface RoomJoinData {
  user: PublicUser;
  room: PublicRoom;
  users: PublicUser[];
}

export type RoomJoinAck = AckResponse<RoomJoinData>;

export type RoomLeavePayload = Record<string, never>; // el servidor infiere la sala del socket, no del payload

export type RoomLeaveAck = AckResponse<Record<string, never>>;

export interface MessageSendPayload {
  text: string; // sin roomId: el servidor determina la sala activa del socket, nunca confía en el cliente
  /** Prototipo: data URL base64 opcional. Si se envía, `text` puede ir vacío (funciona como pie de foto opcional). */
  imageData?: string;
}

// --- Payloads Socket.IO (servidor -> cliente) ---

export interface RoomPresenceEventPayload {
  roomId: string;
  user: PublicUser;
}

export interface RoomUsersPayload {
  roomId: string;
  users: PublicUser[];
}

// --- Solicitudes de ingreso a salas privadas ---

/** Emitido al creador cuando alguien más pide entrar a su sala privada. */
export interface RoomJoinRequestPayload {
  requestId: string;
  roomId: string;
  requester: PublicUser;
  expiresAt: number; // epoch ms
}

export interface RoomApprovePayload {
  requestId: string;
  guestUserId: string; // identidad de quien aprueba, debe coincidir con el creator de la sala
}

export type RoomApproveAck = AckResponse<Record<string, never>>;

export interface RoomRejectPayload {
  requestId: string;
  guestUserId: string; // identidad de quien rechaza, debe coincidir con el creator de la sala
}

export type RoomRejectAck = AckResponse<Record<string, never>>;

/** Emitido al solicitante cuando su solicitud de ingreso se resuelve (aprobada, rechazada o expirada). */
export type RoomJoinResolvedPayload = RoomJoinAck;

// --- Eventos ---

export interface ClientToServerEvents {
  "room:join": (payload: RoomJoinPayload, ack: (response: RoomJoinAck) => void) => void;
  "room:leave": (payload: RoomLeavePayload, ack: (response: RoomLeaveAck) => void) => void;
  "room:approve": (payload: RoomApprovePayload, ack: (response: RoomApproveAck) => void) => void;
  "room:reject": (payload: RoomRejectPayload, ack: (response: RoomRejectAck) => void) => void;
  "message:send": (payload: MessageSendPayload, ack: (response: MessageAck) => void) => void;
}

export interface ServerToClientEvents {
  "room:joined": (payload: RoomPresenceEventPayload) => void;
  "room:left": (payload: RoomPresenceEventPayload) => void;
  "room:users": (payload: RoomUsersPayload) => void;
  "room:join-request": (payload: RoomJoinRequestPayload) => void;
  "room:join-resolved": (payload: RoomJoinResolvedPayload) => void;
  "message:new": (message: ChatMessage) => void;
}
