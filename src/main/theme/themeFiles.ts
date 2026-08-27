import { randomUUID } from "node:crypto";
import { open, writeFile } from "node:fs/promises";

import {
  ThemeDefinitionSchema,
  type ThemeDefinition,
} from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import type { ThemeImportPreview } from "../../shared/ipc/contract";
import {
  deriveCompleteTheme,
  validateReadableTheme,
} from "../../shared/theme/deriveTheme";
import {
  ThemeFileSchema,
  THEME_FILE_SCHEMA_URL,
  type ThemeFile,
} from "../../shared/theme/themeSchema";
import {
  DEFAULT_THEME_RADIUS,
  LEGACY_THEME_OVERRIDE_TOKENS,
  SHADCN_THEME_TOKENS,
  type LegacyThemeOverrideToken,
  type ShadcnThemeToken,
} from "../../shared/theme/tokens";

const MAX_THEME_FILE_BYTES = 256 * 1024;
const THEME_FILE_SUFFIX = ".kopper-theme.json";

export interface ThemeDialog {
  showOpenDialog(options: {
    title: string;
    properties: ["openFile"];
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
  showSaveDialog(options: {
    title: string;
    defaultPath: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePath?: string }>;
}

export interface ThemeFileHandle {
  stat(): Promise<{ size: number; isFile(): boolean }>;
  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: null,
  ): Promise<{ bytesRead: number }>;
  close(): Promise<void>;
}

export interface ThemeFileSystem {
  open(path: string): Promise<ThemeFileHandle>;
  writeFile(path: string, contents: string): Promise<void>;
}

export interface ThemeFilesOptions {
  fileSystem?: ThemeFileSystem;
  createId?: () => string;
}

const nodeFileSystem: ThemeFileSystem = {
  open: async (path) => open(path, "r"),
  writeFile: async (path, contents) => {
    await writeFile(path, contents, { mode: 0o600 });
  },
};

function failure(
  code: KopperError["code"],
  message: string,
): Result<never, KopperError> {
  return {
    ok: false,
    error: { code, message, retryable: false },
  };
}

function toExternalTheme(theme: ThemeDefinition): ThemeFile {
  const externalMode = (
    mode: ThemeDefinition["light"],
  ): ThemeFile["light"] => {
    const external = {} as Record<ShadcnThemeToken, string>;
    for (const token of SHADCN_THEME_TOKENS) {
      external[token] =
        token === "radius" ? DEFAULT_THEME_RADIUS : mode[token];
    }
    return external;
  };
  return {
    $schema: THEME_FILE_SCHEMA_URL,
    version: theme.version,
    name: theme.name,
    light: externalMode(theme.light),
    dark: externalMode(theme.dark),
  };
}

function normalizedLegacyTokens(
  input: unknown,
  mode: "light" | "dark",
): LegacyThemeOverrideToken[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [];
  }
  const candidate = (input as Record<string, unknown>)[mode];
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return [];
  }
  const values = candidate as Record<string, unknown>;
  return LEGACY_THEME_OVERRIDE_TOKENS.filter((token) => {
    if (token === "radius") {
      return values.radius !== DEFAULT_THEME_RADIUS;
    }
    return values[token] !== undefined;
  });
}

function suggestedFileName(name: string): string {
  const withoutKnownSuffix = name.toLowerCase().endsWith(THEME_FILE_SUFFIX)
    ? name.slice(0, -THEME_FILE_SUFFIX.length)
    : name;
  const stem = withoutKnownSuffix
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "custom-theme";
  return `${stem}${THEME_FILE_SUFFIX}`;
}

export class ThemeFiles {
  private readonly fileSystem: ThemeFileSystem;
  private readonly createId: () => string;

  constructor(
    private readonly dialog: ThemeDialog,
    options: ThemeFilesOptions = {},
  ) {
    this.fileSystem = options.fileSystem ?? nodeFileSystem;
    this.createId = options.createId ?? randomUUID;
  }

  async importForPreview(): Promise<
    Result<ThemeImportPreview | null, KopperError>
  > {
    const chosen = await this.dialog.showOpenDialog({
      title: "Import Kopper theme",
      properties: ["openFile"],
      filters: [{ name: "Kopper theme", extensions: ["json"] }],
    });
    if (chosen.canceled || chosen.filePaths.length === 0) {
      return { ok: true, value: null };
    }

    const path = chosen.filePaths[0];
    let raw: Buffer;
    let handle: ThemeFileHandle | undefined;
    try {
      handle = await this.fileSystem.open(path);
      const metadata = await handle.stat();
      if (!metadata.isFile()) {
        return failure("read_failed", "The selected theme could not be read.");
      }
      if (metadata.size > MAX_THEME_FILE_BYTES) {
        return failure(
          "validation_failed",
          "The selected theme exceeds the 256 KiB size limit.",
        );
      }

      const bounded = Buffer.allocUnsafe(MAX_THEME_FILE_BYTES + 1);
      let bytesRead = 0;
      while (bytesRead < bounded.byteLength) {
        const read = await handle.read(
          bounded,
          bytesRead,
          bounded.byteLength - bytesRead,
          null,
        );
        if (read.bytesRead === 0) break;
        if (read.bytesRead < 0 || read.bytesRead > bounded.byteLength - bytesRead) {
          throw new Error("Invalid file read length");
        }
        bytesRead += read.bytesRead;
      }
      if (bytesRead > MAX_THEME_FILE_BYTES) {
        return failure(
          "validation_failed",
          "The selected theme exceeds the 256 KiB size limit.",
        );
      }
      raw = bounded.subarray(0, bytesRead);
    } catch {
      return failure("read_failed", "The selected theme could not be read.");
    } finally {
      try {
        await handle?.close();
      } catch {
        // A close failure must not expose filesystem details or replace the bounded read result.
      }
    }

    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch {
      return failure(
        "validation_failed",
        "The selected theme is not valid UTF-8.",
      );
    }

    let input: unknown;
    try {
      input = JSON.parse(decoded);
    } catch {
      return failure(
        "validation_failed",
        "The selected theme is not valid JSON.",
      );
    }

    const parsed = ThemeFileSchema.safeParse(input);
    if (!parsed.success) {
      return failure(
        "validation_failed",
        "The selected file is not a valid Kopper theme.",
      );
    }
    const normalizedTokens = {
      light: normalizedLegacyTokens(input, "light"),
      dark: normalizedLegacyTokens(input, "dark"),
    };
    const readable = validateReadableTheme(deriveCompleteTheme(parsed.data));
    if (!readable.ok) return readable;

    const complete = readable.value;
    const preview = ThemeDefinitionSchema.safeParse({
      id: this.createId(),
      version: complete.version,
      name: complete.name,
      light: complete.light,
      dark: complete.dark,
    });
    if (!preview.success) {
      return failure(
        "validation_failed",
        "The imported theme could not be assigned an identifier.",
      );
    }
    return {
      ok: true,
      value: { theme: preview.data, normalizedTokens },
    };
  }

  async exportTheme(
    theme: ThemeDefinition,
  ): Promise<Result<{ path: string } | null, KopperError>> {
    const persisted = ThemeDefinitionSchema.safeParse(theme);
    if (!persisted.success) {
      return failure("validation_failed", "The selected theme is invalid.");
    }
    const external = ThemeFileSchema.safeParse(toExternalTheme(persisted.data));
    if (!external.success) {
      return failure("validation_failed", "The selected theme is invalid.");
    }
    const readable = validateReadableTheme(deriveCompleteTheme(external.data));
    if (!readable.ok) return readable;

    const chosen = await this.dialog.showSaveDialog({
      title: "Export Kopper theme",
      defaultPath: suggestedFileName(external.data.name),
      filters: [{ name: "Kopper theme", extensions: ["json"] }],
    });
    if (chosen.canceled || chosen.filePath === undefined) {
      return { ok: true, value: null };
    }

    try {
      await this.fileSystem.writeFile(
        chosen.filePath,
        `${JSON.stringify(external.data, null, 2)}\n`,
      );
      return { ok: true, value: { path: chosen.filePath } };
    } catch {
      return failure(
        "write_failed",
        "The theme export could not be written.",
      );
    }
  }
}
