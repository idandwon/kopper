import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperApi, ThemeImportPreview } from "../../../../shared/ipc/contract";
import { OXIDE_LEDGER_THEME } from "../../../../shared/theme/presets";
import { useTheme } from "../../theme/ThemeProvider";
import { ThemeImportDialog } from "./ThemeImportDialog";

vi.mock("../../theme/ThemeProvider", () => ({ useTheme: vi.fn() }));

const previewTheme = vi.fn();
const cancelPreview = vi.fn();
const savePreview = vi.fn().mockResolvedValue({ status: "saved" });
const preview: ThemeImportPreview = {
  theme: { ...structuredClone(OXIDE_LEDGER_THEME), id: "71e13585-a167-4fe6-9819-34f3c2522237", name: "Imported Ledger" },
  derivedTokens: { light: ["capture"], dark: [] },
};

beforeEach(() => {
  previewTheme.mockReset(); cancelPreview.mockReset(); savePreview.mockReset().mockResolvedValue({ status: "saved" });
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

    rendered.rerender(<ThemeImportDialog api={api({
      ok: false,
      error: {
        code: "validation_failed",
        message: "Theme readability validation found 2 problems.",
        retryable: false,
        failures: [{
          mode: "dark",
          backgroundToken: "primary",
          foregroundToken: "primary-foreground",
          ratio: 2.31,
        }],
        opaqueBackgroundModes: ["light"],
      },
    })} />);
    await user.click(screen.getByRole("button", { name: "Import theme" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Theme readability validation found 2 problems.");
    expect(alert).toHaveTextContent("dark: primary / primary-foreground — 2.31:1; minimum 4.5:1");
    expect(alert).toHaveTextContent("light: background must be opaque.");

    rendered.rerender(<ThemeImportDialog api={api({
      ok: false,
      error: { code: "read_failed", message: "Could not read that file.", retryable: false },
    })} />);
    await user.click(screen.getByRole("button", { name: "Import theme" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read that file.");
    expect(screen.queryByText(/primary-foreground/)).not.toBeInTheDocument();
    expect(screen.queryByText(/background must be opaque/)).not.toBeInTheDocument();
  });

  it("opens without applying, previews renderer-only, restores on cancel, and saves by generated ID", async () => {
    const user = userEvent.setup();
    render(<ThemeImportDialog api={api({ ok: true, value: preview })} />);
    await user.click(screen.getByRole("button", { name: "Import theme" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Imported Ledger");
    expect(screen.getByText("Derived lifecycle tokens: capture")).toBeInTheDocument();
    expect(screen.getAllByText(/:1 contrast/)).toHaveLength(10);
    expect(screen.getByText(`background: ${preview.theme.light.background}`)).toBeVisible();
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

  it("prevents cancel, Escape, outside close, and preview while Save is pending", async () => {
    let resolveSave: ((value: { status: "saved" }) => void) | undefined;
    savePreview.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
    const user = userEvent.setup();
    render(<ThemeImportDialog api={api({ ok: true, value: preview })} />);
    await user.click(screen.getByRole("button", { name: "Import theme" }));
    await user.click(screen.getByRole("button", { name: "Save imported theme" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(cancelPreview).not.toHaveBeenCalled();

    await act(async () => resolveSave?.({ status: "saved" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("announces not-saved and saved-but-not-activated outcomes as alerts", async () => {
    const user = userEvent.setup();
    savePreview.mockResolvedValueOnce({ status: "upsert_failed" });
    render(<ThemeImportDialog api={api({ ok: true, value: preview })} />);
    await user.click(screen.getByRole("button", { name: "Import theme" }));
    await user.click(screen.getByRole("button", { name: "Save imported theme" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("was not saved");

    savePreview.mockResolvedValueOnce({ status: "activation_failed" });
    await user.click(screen.getByRole("button", { name: "Save imported theme" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("saved, but could not be activated");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
