import { describe, expect, it, vi } from "vitest";

import type { ThemeDefinition } from "../../shared/domain/document";
import { OXIDE_LEDGER_THEME } from "../../shared/theme/presets";
import {
  THEME_FILE_SCHEMA_URL,
  type ThemeFile,
} from "../../shared/theme/themeSchema";
import {
  ThemeFiles,
  type ThemeDialog,
  type ThemeFileSystem,
} from "./themeFiles";

function externalTheme(
  theme: ThemeDefinition = OXIDE_LEDGER_THEME,
): ThemeFile {
  return {
    $schema: THEME_FILE_SCHEMA_URL,
    version: theme.version,
    name: theme.name,
    light: structuredClone(theme.light),
    dark: structuredClone(theme.dark),
  };
}

function dialog(overrides: Partial<ThemeDialog> = {}): ThemeDialog {
  return {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
    ...overrides,
  };
}

function fileSystem(raw = Buffer.from(JSON.stringify(externalTheme()))): ThemeFileSystem & {
  readFile: ReturnType<typeof vi.fn<ThemeFileSystem["readFile"]>>;
  stat: ReturnType<typeof vi.fn<ThemeFileSystem["stat"]>>;
  writeFile: ReturnType<typeof vi.fn<ThemeFileSystem["writeFile"]>>;
} {
  return {
    stat: vi.fn<ThemeFileSystem["stat"]>().mockResolvedValue({ size: raw.byteLength }),
    readFile: vi.fn<ThemeFileSystem["readFile"]>().mockResolvedValue(raw),
    writeFile: vi.fn<ThemeFileSystem["writeFile"]>().mockResolvedValue(undefined),
  };
}

describe("ThemeFiles", () => {
  it("imports a validated derived preview and assigns an ID only after validation", async () => {
    const input = externalTheme();
    delete input.light.capture;
    delete input.light.organized;
    delete input.light.completed;
    const fs = fileSystem(Buffer.from(JSON.stringify(input)));
    const createId = vi.fn(() => "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5");
    const files = new ThemeFiles(
      dialog({
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ["/private/theme.kopper-theme.json"],
        }),
      }),
      { fileSystem: fs, createId },
    );

    await expect(files.importForPreview()).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({
        id: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
        name: input.name,
        light: expect.objectContaining({
          capture: input.light.primary,
          organized: input.light.accent,
          completed: input.light["muted-foreground"],
        }),
      }),
    });
    expect(createId).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("does not assign an ID to invalid, unreadable, oversized, or malformed UTF-8 imports", async () => {
    const createId = vi.fn(() => "unused");
    const cases = [
      Buffer.from("{not-json"),
      Buffer.from(JSON.stringify({ ...externalTheme(), extra: true })),
      Buffer.from(JSON.stringify({ ...externalTheme(), id: "external-id" })),
      Buffer.from(
        JSON.stringify({
          ...externalTheme(),
          light: {
            ...externalTheme().light,
            foreground: externalTheme().light.background,
          },
        }),
      ),
      Buffer.from([0xc3, 0x28]),
      Buffer.alloc(256 * 1024 + 1),
    ];

    for (const raw of cases) {
      const fs = fileSystem(raw);
      const files = new ThemeFiles(
        dialog({
          showOpenDialog: vi.fn().mockResolvedValue({
            canceled: false,
            filePaths: ["/private/theme.json"],
          }),
        }),
        { fileSystem: fs, createId },
      );
      await expect(files.importForPreview()).resolves.toMatchObject({
        ok: false,
        error: { retryable: false },
      });
    }
    expect(createId).not.toHaveBeenCalled();
  });

  it("exports the exact strict external shape without the internal ID", async () => {
    const fs = fileSystem();
    const nativeDialog = dialog({
      showSaveDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePath: "/private/oxide-ledger.kopper-theme.json",
      }),
    });
    const files = new ThemeFiles(nativeDialog, { fileSystem: fs });

    await expect(files.exportTheme(OXIDE_LEDGER_THEME)).resolves.toEqual({
      ok: true,
      value: { path: "/private/oxide-ledger.kopper-theme.json" },
    });
    expect(nativeDialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "oxide-ledger.kopper-theme.json",
        filters: [{ name: "Kopper theme", extensions: ["json"] }],
      }),
    );
    const written = fs.writeFile.mock.calls[0]?.[1];
    expect(JSON.parse(String(written))).toEqual(externalTheme());
    expect(JSON.parse(String(written))).not.toHaveProperty("id");
    expect(Object.keys(JSON.parse(String(written)))).toEqual([
      "$schema",
      "version",
      "name",
      "light",
      "dark",
    ]);
  });

  it("sanitizes names with normalization and appends the compound extension once", async () => {
    const nativeDialog = dialog();
    const files = new ThemeFiles(nativeDialog, { fileSystem: fileSystem() });
    await files.exportTheme({
      ...OXIDE_LEDGER_THEME,
      id: "custom:cafe",
      name: "Café & Copper.kopper-theme.json",
    });
    expect(nativeDialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "cafe-copper.kopper-theme.json",
      }),
    );
  });

  it.each(["!!!", "主题", "...kopper-theme.json"])(
    "uses a safe fallback and appends the compound extension exactly once for %s",
    async (name) => {
      const nativeDialog = dialog();
      const files = new ThemeFiles(nativeDialog, { fileSystem: fileSystem() });
      await files.exportTheme({ ...OXIDE_LEDGER_THEME, id: "custom:x", name });
      expect(nativeDialog.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: "custom-theme.kopper-theme.json",
        }),
      );
    },
  );

  it("returns null success for native-dialog cancellation", async () => {
    const files = new ThemeFiles(dialog(), { fileSystem: fileSystem() });
    await expect(files.importForPreview()).resolves.toEqual({ ok: true, value: null });
    await expect(files.exportTheme(OXIDE_LEDGER_THEME)).resolves.toEqual({
      ok: true,
      value: null,
    });
  });

  it("validates exports before writing and reports structured read/write errors", async () => {
    const fs = fileSystem();
    const files = new ThemeFiles(
      dialog({
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: "/private/out" }),
      }),
      { fileSystem: fs },
    );
    const unreadable = structuredClone(OXIDE_LEDGER_THEME);
    unreadable.light.foreground = unreadable.light.background;
    await expect(files.exportTheme(unreadable)).resolves.toMatchObject({
      ok: false,
      error: { code: "validation_failed" },
    });
    expect(fs.writeFile).not.toHaveBeenCalled();

    fs.writeFile.mockRejectedValueOnce(new Error("denied"));
    await expect(files.exportTheme(OXIDE_LEDGER_THEME)).resolves.toMatchObject({
      ok: false,
      error: { code: "write_failed", retryable: false },
    });
  });
});
