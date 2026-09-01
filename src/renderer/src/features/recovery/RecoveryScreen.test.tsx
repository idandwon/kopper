import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument } from "../../../../shared/domain/document";
import { RecoveryScreen } from "./RecoveryScreen.js";

const api = {
  getDataPath: vi.fn(),
  chooseDataImport: vi.fn(),
  confirmDataImport: vi.fn(),
  exportRecoveryBytes: vi.fn(),
  createNewStore: vi.fn(),
};
const error = {
  code: "invalid_document" as const,
  message: "The store is malformed.",
  retryable: false,
  recoveryAction: "choose_file" as const,
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  api.getDataPath.mockReset().mockResolvedValue({ ok: true, value: "/Users/me/Kopper/kopper.json" });
  api.chooseDataImport.mockReset().mockResolvedValue({ ok: true, value: null });
  api.confirmDataImport.mockReset();
  api.exportRecoveryBytes.mockReset().mockResolvedValue({ ok: true, value: { cancelled: true } });
  api.createNewStore.mockReset().mockResolvedValue({ ok: true, value: createEmptyDocument(new Date("2026-08-16T12:00:00.000Z")) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RecoveryScreen", () => {
  it("shows the active path and never overwrites without explicit confirmation", async () => {
    const user = userEvent.setup();
    render(<RecoveryScreen error={error} api={api} />);

    expect(await screen.findByText("/Users/me/Kopper/kopper.json")).toBeVisible();
    expect(
      screen.queryByText("Lifecycle: captured to completed"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/will not overwrite this damaged file automatically/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide Kopper" })).toBeVisible();
    expect(api.createNewStore).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Create new store" }));
    expect(api.createNewStore).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm create new store" }));
    expect(api.createNewStore).toHaveBeenCalledOnce();
  });

  it("keeps one recovery scroll owner and the complete long active path", async () => {
    const longPath = `/Users/me/${"nested-directory/".repeat(18)}kopper-damaged.json`;
    api.getDataPath.mockResolvedValueOnce({ ok: true, value: longPath });
    const { container } = render(<RecoveryScreen error={error} api={api} />);

    const path = await screen.findByText(longPath);
    expect(path).toBeVisible();
    expect(path).toHaveTextContent(longPath);
    expect(path).toHaveClass("break-all");
    expect(
      container.querySelectorAll('[data-scroll-owner="recovery"]'),
    ).toHaveLength(1);
  });

  it("offers import and unchanged damaged-byte export", async () => {
    const user = userEvent.setup();
    api.exportRecoveryBytes.mockResolvedValueOnce({
      ok: true,
      value: { cancelled: false, fileName: "damaged.json" },
    });
    render(<RecoveryScreen error={error} api={api} />);

    await user.click(screen.getByRole("button", { name: "Export damaged content" }));
    expect(screen.getByRole("status")).toHaveTextContent("Exported damaged.json unchanged.");

    await user.click(screen.getByRole("button", { name: "Choose another file" }));
    expect(api.chooseDataImport).toHaveBeenCalledOnce();
    expect(screen.queryByText("Import cancelled.")).not.toBeInTheDocument();
    expect(screen.queryByText("Exported damaged.json unchanged.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export damaged content" }));
    expect(api.exportRecoveryBytes).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Damaged-content export cancelled.")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
