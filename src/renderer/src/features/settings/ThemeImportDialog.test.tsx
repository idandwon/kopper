import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperApi, ThemeImportPreview } from "../../../../shared/ipc/contract";
import { OXIDE_LEDGER_THEME } from "../../../../shared/theme/presets";
import { useTheme } from "../../theme/ThemeProvider";
import { ThemeImportDialog } from "./ThemeImportDialog";

vi.mock("../../theme/ThemeProvider", () => ({ useTheme: vi.fn() }));

const previewTheme = vi.fn();
const cancelPreview = vi.fn();
const savePreview = vi.fn().mockResolvedValue(true);
const preview: ThemeImportPreview = {
  theme: { ...structuredClone(OXIDE_LEDGER_THEME), id: "71e13585-a167-4fe6-9819-34f3c2522237", name: "Imported Ledger" },
  derivedTokens: { light: ["capture"], dark: [] },
};

beforeEach(() => {
  previewTheme.mockReset(); cancelPreview.mockReset(); savePreview.mockReset().mockResolvedValue(true);
  vi.mocked(useTheme).mockReturnValue({ resolvedMode: "light", activeTheme: OXIDE_LEDGER_THEME, previewTheme, cancelPreview, savePreview });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function api(result: Awaited<ReturnType<KopperApi["importTheme"]>>) {
  return { importTheme: vi.fn().mockResolvedValue(result) };
}

describe("ThemeImportDialog", () => {
  it("keeps cancellation inert and reports structured invalid imports accessibly", async () => {
    const user = userEvent.setup();
    const cancelled = api({ ok: true, value: null });
    const rendered = render(<ThemeImportDialog api={cancelled} />);
    await user.click(screen.getByRole("button", { name: "Import theme" }));
    expect(previewTheme).not.toHaveBeenCalled();
    expect(cancelPreview).not.toHaveBeenCalled();

    rendered.rerender(<ThemeImportDialog api={api({ ok: false, error: { code: "validation_failed", message: "Invalid theme structure.", retryable: false } })} />);
    await user.click(screen.getByRole("button", { name: "Import theme" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid theme structure.");
  });

  it("opens without applying, previews renderer-only, restores on cancel, and saves by generated ID", async () => {
    const user = userEvent.setup();
    render(<ThemeImportDialog api={api({ ok: true, value: preview })} />);
    await user.click(screen.getByRole("button", { name: "Import theme" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Imported Ledger");
    expect(screen.getByText("Derived lifecycle tokens: capture")).toBeInTheDocument();
    expect(previewTheme).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(previewTheme).toHaveBeenCalledWith(preview.theme);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelPreview).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Import theme" }));
    await user.click(await screen.findByRole("button", { name: "Save imported theme" }));
    expect(savePreview).toHaveBeenCalledWith(preview.theme);
    expect(await screen.findByRole("status")).toHaveTextContent("Export is now available");
  });
});
