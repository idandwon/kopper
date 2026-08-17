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
  api.getDataPath.mockReset().mockResolvedValue({ ok: true, value: "/Users/me/Kopper/kopper.json" });
  api.chooseDataImport.mockReset().mockResolvedValue({ ok: true, value: null });
  api.confirmDataImport.mockReset();
  api.exportRecoveryBytes.mockReset().mockResolvedValue({ ok: true, value: { cancelled: true } });
  api.createNewStore.mockReset().mockResolvedValue({ ok: true, value: createEmptyDocument(new Date("2026-08-16T12:00:00.000Z")) });
});
afterEach(cleanup);

describe("RecoveryScreen", () => {
  it("shows the active path and never overwrites without explicit confirmation", async () => {
    const user = userEvent.setup();
    render(<RecoveryScreen error={error} api={api} />);

    expect(await screen.findByText("/Users/me/Kopper/kopper.json")).toBeVisible();
    expect(screen.getByText("Lifecycle: captured to completed")).toBeVisible();
    expect(screen.getByText(/will not overwrite this damaged file automatically/i)).toBeVisible();
    expect(api.createNewStore).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Create new store" }));
    expect(api.createNewStore).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm create new store" }));
    expect(api.createNewStore).toHaveBeenCalledOnce();
  });

  it("offers import and unchanged damaged-byte export", async () => {
    const user = userEvent.setup();
    render(<RecoveryScreen error={error} api={api} />);
    await user.click(screen.getByRole("button", { name: "Choose another file" }));
    expect(api.chooseDataImport).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Export damaged content" }));
    expect(api.exportRecoveryBytes).toHaveBeenCalledOnce();
  });
});
