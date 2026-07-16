const STORAGE_KEY = "realtime-chat:activeRoomSlug";
export const DEFAULT_ROOM_SLUG = "general";

export function getStoredActiveRoomSlug(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_ROOM_SLUG;
  } catch {
    return DEFAULT_ROOM_SLUG;
  }
}

export function storeActiveRoomSlug(slug: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, slug);
  } catch {
    // localStorage puede no estar disponible (modo privado, cuotas, etc.)
  }
}
