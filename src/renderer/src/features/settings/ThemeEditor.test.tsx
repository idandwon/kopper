import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OXIDE_LEDGER_THEME } from "../../../../shared/theme/presets";
import {
  KOPPER_THEME_TOKENS,
  SHADCN_THEME_TOKENS,
} from "../../../../shared/theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { ThemeEditor } from "./ThemeEditor";

vi.mock("../../theme/ThemeProvider", () => ({ useTheme: vi.fn() }));

const previewTheme = vi.fn();
const cancelPreview = vi.fn();
const savePreview = vi.fn().mockResolvedValue({ status: "saved" });
const onOpenChange = vi.fn();
const customTheme = {
  ...structuredClone(OXIDE_LEDGER_THEME),
  id: "custom:editor",
  name: "Editor Theme",
};

beforeEach(() => {
  vi.useFakeTimers();
  previewTheme.mockReset();
  cancelPreview.mockReset();
  savePreview.mockReset().mockResolvedValue({ status: "saved" });
  onOpenChange.mockReset();
  vi.mocked(useTheme).mockReturnValue({
    resolvedMode: "light",
    activeTheme: OXIDE_LEDGER_THEME,
    previewTheme,
    cancelPreview,
    savePreview,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderEditor() {
  return render(
    <ThemeEditor
      baseTheme={customTheme}
      custom
      open
      onOpenChange={onOpenChange}
    />,
  );
}

async function validate() {
  await act(async () => {
    vi.advanceTimersByTime(150);
  });
}

describe("ThemeEditor", () => {
  it("labels every token field and gives each color picker a token-specific name", () => {
    renderEditor();
    const tokens = [...SHADCN_THEME_TOKENS, ...KOPPER_THEME_TOKENS];

    for (const token of tokens) {
      expect(screen.getByLabelText(token)).toHaveAttribute(
        "id",
        `light-${token}`,
      );
      if (token !== "radius") {
        expect(
          screen.getByLabelText(`${token} color picker`),
        ).toHaveAttribute("type", "color");
      }
    }
    expect(globalThis.document.querySelectorAll('[data-slot="label"]')).toHaveLength(
      tokens.length + 1,
    );
  });

  it("uses one bounded token scroll viewport in an overflow-hidden dialog shell", () => {
    renderEditor();
    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveClass("overflow-hidden");
    expect(
      dialog.querySelectorAll('[data-scroll-owner="theme-editor"]'),
    ).toHaveLength(1);
  });

  it("keeps invalid partial text editable, previews valid mode edits immediately, and validates at 150ms", async () => {
    renderEditor();
    const background = screen.getByLabelText("background");
    fireEvent.change(background, { target: { value: "rgb(" } });
    expect(background).toHaveValue("rgb(");
    expect(previewTheme).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("primary"), {
      target: { value: "#123456" },
    });
    expect(previewTheme).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        light: expect.objectContaining({
          background: customTheme.light.background,
          primary: "#123456",
        }),
      }),
      "light",
    );
    expect(screen.getByText("Validating…")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(149);
    });
    expect(screen.getByText("Validating…")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button", { name: "Save theme" })).toBeDisabled();

    fireEvent.change(background, { target: { value: "#ffffff" } });
    expect(previewTheme).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: customTheme.id,
        light: expect.objectContaining({ background: "#ffffff" }),
      }),
      "light",
    );
  });

  it("previews the last-valid draft in the selected mode and carries it through edits and save", async () => {
    renderEditor();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dark" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(previewTheme).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ id: customTheme.id }),
      "dark",
    );
    fireEvent.change(screen.getByLabelText("background"), {
      target: { value: "#101112" },
    });
    expect(previewTheme).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        light: customTheme.light,
        dark: expect.objectContaining({ background: "#101112" }),
      }),
      "dark",
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset background" }));
    expect(previewTheme).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        dark: expect.objectContaining({ background: customTheme.dark.background }),
      }),
      "dark",
    );
    fireEvent.change(screen.getByLabelText("radius"), {
      target: { value: "1.5rem" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(previewTheme).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ dark: customTheme.dark }),
      "dark",
    );
    await validate();
    fireEvent.click(screen.getByRole("button", { name: "Save theme" }));
    await act(async () => {});
    expect(savePreview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: customTheme.id }),
      "dark",
    );
  });

  it("shows contrast failures at both involved tokens, blocks save, and accepts radius boundaries", async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("background"), {
      target: { value: customTheme.light.foreground },
    });
    expect(previewTheme).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        light: expect.objectContaining({
          background: customTheme.light.foreground,
        }),
      }),
      "light",
    );
    await validate();
    expect(screen.getAllByText(/4.5:1 required/).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(screen.getByRole("button", { name: "Save theme" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("background"), {
      target: { value: customTheme.light.background },
    });
    const radius = screen.getByLabelText("radius");
    fireEvent.change(radius, { target: { value: "0rem" } });
    expect(previewTheme).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        light: expect.objectContaining({ radius: "0rem" }),
      }),
      "light",
    );
    fireEvent.change(radius, { target: { value: "2rem" } });
    expect(previewTheme).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        light: expect.objectContaining({ radius: "2rem" }),
      }),
      "light",
    );
  });

  it("blocks close, discard, reset, and editing while save acknowledgment is pending", async () => {
    let resolveSave: ((value: { status: "saved" }) => void) | undefined;
    savePreview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderEditor();
    fireEvent.change(screen.getByLabelText("Theme name"), {
      target: { value: "Pending Theme" },
    });
    await validate();
    fireEvent.click(screen.getByRole("button", { name: "Save theme" }));

    expect(screen.getByLabelText("Theme name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(cancelPreview).not.toHaveBeenCalled();

    await act(async () => resolveSave?.({ status: "saved" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports partial activation accurately and keeps the editor open for retry", async () => {
    savePreview.mockResolvedValueOnce({ status: "activation_failed" });
    renderEditor();
    fireEvent.change(screen.getByLabelText("Theme name"), {
      target: { value: "Saved not active" },
    });
    await validate();
    fireEvent.click(screen.getByRole("button", { name: "Save theme" }));
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent(
      "saved, but could not be activated",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("resets from the immutable base, confirms dirty close, restores exactly, and saves a valid custom ID", async () => {
    renderEditor();
    const primary = screen.getByLabelText("primary");
    fireEvent.change(primary, { target: { value: "#000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset primary" }));
    expect(primary).toHaveValue(customTheme.light.primary);
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(screen.getByLabelText("background")).toHaveValue(
      customTheme.light.background,
    );

    fireEvent.change(screen.getByLabelText("Theme name"), {
      target: { value: "Saved Editor" },
    });
    await validate();
    fireEvent.click(screen.getByRole("button", { name: "Save theme" }));
    await act(async () => {});
    expect(savePreview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: customTheme.id, name: "Saved Editor" }),
      "light",
    );

    cleanup();
    cancelPreview.mockReset();
    renderEditor();
    fireEvent.change(screen.getByLabelText("Theme name"), {
      target: { value: "Unsaved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard theme changes?")).toBeInTheDocument();
    expect(cancelPreview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(cancelPreview).toHaveBeenCalledOnce();
  });

  it("releases its preview ownership when a forced route unmounts the editor", () => {
    const view = renderEditor();
    fireEvent.change(screen.getByLabelText("primary"), {
      target: { value: "#123456" },
    });
    expect(previewTheme).toHaveBeenCalled();

    view.unmount();

    expect(cancelPreview).toHaveBeenCalledOnce();
  });

  it("creates a UUID for bundled customization and preserves a custom ID", async () => {
    const generatedId = "73a81b93-df8b-42c1-8f31-38b05864b1c4";
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => generatedId) });
    render(
      <ThemeEditor
        baseTheme={OXIDE_LEDGER_THEME}
        custom={false}
        open
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Theme name"), {
      target: { value: "Bundled Copy" },
    });
    await validate();
    fireEvent.click(screen.getByRole("button", { name: "Save theme" }));
    await act(async () => {});
    expect(savePreview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: generatedId }),
      "light",
    );
  });
});
