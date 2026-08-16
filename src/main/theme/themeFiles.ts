import { randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";

import {
  ThemeDefinitionSchema,
  type ThemeDefinition,
} from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import {
  deriveCompleteTheme,
  validateReadableTheme,
} from "../../shared/theme/deriveTheme";
import {
  ThemeFileSchema,
  THEME_FILE_SCHEMA_URL,
  type ThemeFile,
} from "../../shared/theme/themeSchema";

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

export interface ThemeFileSystem {
  stat(path: string): Promise<{ size: number }>;
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, contents: string): Promise<void>;
}

export interface ThemeFilesOptions {
  fileSystem?: ThemeFileSystem;
  createId?: () => string;
}

const nodeFileSystem: ThemeFileSystem = {
  stat: async (path) => stat(path),
  readFile,
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
  return {
    $schema: THEME_FILE_SCHEMA_URL,
    version: theme.version,
    name: theme.name,
    light: theme.light,
    dark: theme.dark,
  };
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
    Result<ThemeDefinition | null, KopperError>
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
    try {
      const metadata = await this.fileSystem.stat(path);
      if (metadata.size > MAX_THEME_FILE_BYTES) {
        return failure(
          "validation_failed",
          "The selected theme exceeds the 256 KiB size limit.",
        );
      }
      raw = await this.fileSystem.readFile(path);
    } catch {
      return failure("read_failed", "The selected theme could not be read.");
    }
    if (raw.byteLength > MAX_THEME_FILE_BYTES) {
      return failure(
        "validation_failed",
        "The selected theme exceeds the 256 KiB size limit.",
      );
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
    return { ok: true, value: preview.data };
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
