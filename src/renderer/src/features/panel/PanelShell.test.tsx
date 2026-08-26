import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PanelShell } from "./PanelShell";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PanelShell", () => {
  it("puts the design-system Hide Kopper control before panel content", async () => {
    const hidePanel = vi.fn().mockResolvedValue(undefined);
    window.kopper = { hidePanel } as never;
    const user = userEvent.setup();
    render(
      <PanelShell>
        <button type="button">First content action</button>
      </PanelShell>,
    );

    const hide = screen.getByRole("button", { name: "Hide Kopper" });
    expect(screen.getAllByRole("button")[0]).toBe(hide);
    expect(hide).toHaveAttribute("data-size", "icon-sm");
    expect(hide).toHaveAttribute("data-variant", "ghost");
    expect(hide.querySelector('[data-icon="close"]')).toBeInTheDocument();

    await user.hover(hide);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Hide Kopper");
    await user.click(hide);
    expect(hidePanel).toHaveBeenCalledOnce();
  });
});
