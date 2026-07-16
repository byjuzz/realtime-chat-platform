import { beforeEach, describe, expect, it } from "vitest";
import { getStoredGuestUserId, storeGuestUserId } from "../guestIdentity";

describe("guestIdentity", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("retorna null cuando no hay id guardado", () => {
    expect(getStoredGuestUserId()).toBeNull();
  });

  it("conserva el guestUserId entre lecturas (simula recargas)", () => {
    storeGuestUserId("guest-123");
    expect(getStoredGuestUserId()).toBe("guest-123");
  });
});
