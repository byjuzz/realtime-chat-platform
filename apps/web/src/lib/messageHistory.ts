import type { MessageHistoryResponse } from "@realtime-chat/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export async function fetchMessageHistory(
  roomSlug: string,
  options: { limit?: number; cursor?: string | null; signal?: AbortSignal } = {}
): Promise<MessageHistoryResponse> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);

  const query = params.toString();
  const response = await fetch(
    `${API_URL}/api/rooms/${roomSlug}/messages${query ? `?${query}` : ""}`,
    { signal: options.signal }
  );

  if (!response.ok) {
    throw new Error(`No se pudo cargar el historial (HTTP ${response.status})`);
  }

  return (await response.json()) as MessageHistoryResponse;
}
