import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRooms } from "../useRooms";

describe("useRooms", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carga la lista de salas al llamar refreshRooms", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          json: async () => ({ rooms: [{ id: "1", name: "General", slug: "general", createdAt: 0 }] }),
        }) as Response
      )
    );

    const { result } = renderHook(() => useRooms());
    await act(async () => {
      await result.current.refreshRooms();
    });

    expect(result.current.rooms).toHaveLength(1);
    expect(result.current.roomsError).toBeNull();
  });

  it("maneja un error de red al listar salas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response)
    );

    const { result } = renderHook(() => useRooms());
    await act(async () => {
      await result.current.refreshRooms();
    });

    expect(result.current.roomsError).not.toBeNull();
  });

  it("crea una sala y la agrega a la lista local inmediatamente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          status: 201,
          json: async () => ({ room: { id: "2", name: "Tecnología", slug: "tecnologia", createdAt: 1 } }),
        }) as Response
      )
    );

    const { result } = renderHook(() => useRooms());
    let created;
    await act(async () => {
      created = await result.current.createRoom("Tecnología");
    });

    expect(created).toMatchObject({ slug: "tecnologia" });
    expect(result.current.rooms.some((r) => r.slug === "tecnologia")).toBe(true);
  });

  it("expone un error tipado cuando el slug ya existe (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: false,
          status: 409,
          json: async () => ({ error: "ROOM_SLUG_CONFLICT", message: "Ya existe una sala con ese nombre." }),
        }) as Response
      )
    );

    const { result } = renderHook(() => useRooms());
    await act(async () => {
      await result.current.createRoom("General");
    });

    await waitFor(() => expect(result.current.createRoomError).toBe("Ya existe una sala con ese nombre."));
  });
});
