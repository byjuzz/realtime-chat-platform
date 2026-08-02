import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessageInput } from "../MessageInput";

describe("MessageInput", () => {
  it("envía el texto y limpia el campo", async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    const input = screen.getByLabelText("Mensaje") as HTMLInputElement;
    await userEvent.type(input, "hola mundo");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSend).toHaveBeenCalledWith("hola mundo", undefined);
    expect(input.value).toBe("");
  });

  it("no envía texto vacío", async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSend).not.toHaveBeenCalled();
  });
});
