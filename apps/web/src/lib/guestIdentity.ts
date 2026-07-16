const STORAGE_KEY = "realtime-chat:guestUserId";

/**
 * Identidad de invitado guardada en localStorage para continuidad entre
 * recargas. NO es autenticación: cualquiera puede borrarla o falsificarla
 * manualmente. Ver ADR-004.
 */
export function getStoredGuestUserId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeGuestUserId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage puede no estar disponible (modo privado, cuotas, etc.)
  }
}
