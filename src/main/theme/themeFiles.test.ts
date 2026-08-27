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
  type ThemeFileHandle,
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

type MockThemeFileSystem = ThemeFileSystem & {
  open: ReturnType<typeof vi.fn<ThemeFileSystem["open"]>>;
  writeFile: ReturnType<typeof vi.fn<ThemeFileSystem["writeFile"]>>;
  handle: {
    stat: ReturnType<typeof vi.fn<ThemeFileHandle["stat"]>>;
    read: ReturnType<typeof vi.fn<ThemeFileHandle["read"]>>;
    close: ReturnType<typeof vi.fn<ThemeFileHandle["close"]>>;
  };
};

function fileSystem(
  raw = Buffer.from(JSON.stringify(externalTheme())),
  options: { statSize?: number; maxReadBytes?: number; isFile?: boolean } = {},
): MockThemeFileSystem {
  let position = 0;
  const handle = {
    stat: vi.fn<ThemeFileHandle["stat"]>().mockResolvedValue({
      size: options.statSize ?? raw.byteLength,
      isFile: () => options.isFile ?? true,
    }),
    read: vi.fn<ThemeFileHandle["read"]>().mockImplementation(
      async (buffer, offset, length) => {
        const bytesRead = Math.min(
          length,
          options.maxReadBytes ?? length,
          raw.byteLength - position,
        );
        if (bytesRead > 0) raw.copy(buffer, offset, position, position + bytesRead);
        position += bytesRead;
        return { bytesRead };
      },
    ),
    close: vi.fn<ThemeFileHandle["close"]>().mockResolvedValue(undefined),
  };
  return {
    open: vi.fn<ThemeFileSystem["open"]>().mockImplementation(async () => {
      position = 0;
      return handle;
    }),
    writeFile: vi.fn<ThemeFileSystem["writeFile"]>().mockResolvedValue(undefined),
    handle,
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
      value: {
        theme: expect.objectContaining({
          id: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
          name: input.name,
          light: expect.objectContaining({
            capture: input.light.primary,
            organized: input.light.accent,
            completed: input.light["muted-foreground"],
          }),
        }),
        normalizedTokens: {
          light: [],
          dark: ["capture", "organized", "completed"],
        },
      },
    });
    expect(createId).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("assigns distinct IDs when the same file is imported repeatedly", async () => {
    const fs = fileSystem();
    const createId = vi.fn()
      .mockReturnValueOnce("0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5")
      .mockReturnValueOnce("cfa93939-a334-4396-83bf-b61f13a3bbbc");
    const files = new ThemeFiles(
      dialog({
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ["/private/theme.kopper-theme.json"],
        }),
      }),
      { fileSystem: fs, createId },
    );

    const first = await files.importForPreview();
    const second = await files.importForPreview();
    expect(first).toMatchObject({ ok: true, value: { theme: { id: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5" } } });
    expect(second).toMatchObject({ ok: true, value: { theme: { id: "cfa93939-a334-4396-83bf-b61f13a3bbbc" } } });
    expect(createId).toHaveBeenCalledTimes(2);
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

  it("bounds reads from one opened descriptor when a small stat races a growing or replaced path", async () => {
    const fs = fileSystem(Buffer.alloc(256 * 1024 + 1), { statSize: 1 });
    const files = new ThemeFiles(
      dialog({
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ["/private/theme.json"],
        }),
      }),
      { fileSystem: fs },
    );

    await expect(files.importForPreview()).resolves.toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        message: "The selected theme exceeds the 256 KiB size limit.",
        retryable: false,
      },
    });
    expect(fs.open).toHaveBeenCalledTimes(1);
    expect(fs.open).toHaveBeenCalledWith("/private/theme.json");
    expect(fs.handle.stat).toHaveBeenCalledTimes(1);
    expect(fs.handle.read).toHaveBeenCalledTimes(1);
    expect(fs.handle.read.mock.calls[0]?.slice(1)).toEqual([
      0,
      256 * 1024 + 1,
      null,
    ]);
    expect(fs.handle.close).toHaveBeenCalledTimes(1);
  });

  it("handles partial descriptor reads and closes after a successful import", async () => {
    const fs = fileSystem(Buffer.from(JSON.stringify(externalTheme())), {
      maxReadBytes: 7,
    });
    const files = new ThemeFiles(
      dialog({
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ["/private/theme.json"],
        }),
      }),
      {
        fileSystem: fs,
        createId: () => "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
      },
    );

    await expect(files.importForPreview()).resolves.toMatchObject({
      ok: true,
      value: { theme: { id: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5" } },
    });
    expect(fs.handle.read.mock.calls.length).toBeGreaterThan(2);
    expect(fs.handle.close).toHaveBeenCalledTimes(1);
  });

  it("rejects special files and closes after stat, read, and decode failures", async () => {
    const chosenDialog = dialog({
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ["/private/theme.json"],
      }),
    });

    const special = fileSystem(undefined, { isFile: false });
    await expect(
      new ThemeFiles(chosenDialog, { fileSystem: special }).importForPreview(),
    ).resolves.toMatchObject({ ok: false, error: { code: "read_failed" } });
    expect(special.handle.read).not.toHaveBeenCalled();
    expect(special.handle.close).toHaveBeenCalledTimes(1);

    const statOversize = fileSystem(undefined, { statSize: 256 * 1024 + 1 });
    await expect(
      new ThemeFiles(chosenDialog, { fileSystem: statOversize }).importForPreview(),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation_failed" },
    });
    expect(statOversize.handle.read).not.toHaveBeenCalled();
    expect(statOversize.handle.close).toHaveBeenCalledTimes(1);

    const readFailure = fileSystem();
    readFailure.handle.read.mockRejectedValueOnce(new Error("private read error"));
    await expect(
      new ThemeFiles(chosenDialog, { fileSystem: readFailure }).importForPreview(),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "read_failed",
        message: "The selected theme could not be read.",
        retryable: false,
      },
    });
    expect(readFailure.handle.close).toHaveBeenCalledTimes(1);

    const decodeFailure = fileSystem(Buffer.from([0xc3, 0x28]));
    await expect(
      new ThemeFiles(chosenDialog, { fileSystem: decodeFailure }).importForPreview(),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation_failed" },
    });
    expect(decodeFailure.handle.close).toHaveBeenCalledTimes(1);
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
    const written = JSON.parse(String(fs.writeFile.mock.calls[0]?.[1])) as Record<
      string,
      unknown
    >;
    expect(written).not.toHaveProperty("id");
    expect(Object.keys(written)).toEqual([
      "$schema",
      "version",
      "name",
      "light",
      "dark",
    ]);
    expect(written).toMatchObject({
      light: { radius: "0.625rem" },
      dark: { radius: "0.625rem" },
    });
    for (const mode of ["light", "dark"] as const) {
      expect(written[mode]).not.toHaveProperty("capture");
      expect(written[mode]).not.toHaveProperty("organized");
      expect(written[mode]).not.toHaveProperty("completed");
    }
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
