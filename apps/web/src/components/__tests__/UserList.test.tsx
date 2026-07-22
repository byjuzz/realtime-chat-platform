import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicUser } from "@realtime-chat/shared";
import { UserList } from "../UserList";

describe("UserList", () => {
  it("marca al usuario actual", () => {
    const users: PublicUser[] = [
      { id: "a1", name: "Ada", guestUserId: "guest-1" },
      { id: "a2", name: "Grace", guestUserId: "guest-2" },
    ];
    render(<UserList users={users} currentUserId="a1" />);

    expect(screen.getByText("Tú")).toBeInTheDocument();
    expect(screen.getByText("Grace")).toBeInTheDocument();
  });
});
