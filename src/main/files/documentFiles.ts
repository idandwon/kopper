import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

import {
  parseDocument,
  type KopperDocument,
} from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import type {
  DataImportPreview,
  FileOperationResult,
} from "../../shared/ipc/contract.js";
import type { NoteRepository } from "../persistence/noteRepository";

export interface DocumentDialog {
  showOpenDialog(options: {
    title: string;
    properties: ["openFile"];
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
  showSaveDialog(options: {
    title: string;
    defaultPath: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePath?: string }>;
}

export interface DocumentFileSystem {
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, contents: string | Uint8Array): Promise<void>;
}

interface PendingImport {
  document: KopperDocument;
  expiresAt: number;
  expirationTimer: ReturnType<typeof setTimeout>;
}

const FIVE_MINUTES = 5 * 60_000;

function failure(code: KopperError["code"], message: string): Result<never, KopperError> {
  return { ok: false, error: { code, message, retryable: false } };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown filesystem error.";
}

const nodeFileSystem: DocumentFileSystem = {
  readFile,
  writeFile: async (path, contents) => {
    await writeFile(path, contents, { mode: 0o600 });
  },
};

export class DocumentFiles {
  private readonly pendingImports = new Map<string, PendingImport>();

  constructor(
    private readonly repository: NoteRepository,
    private readonly dialog: DocumentDialog,
    private readonly fileSystem: DocumentFileSystem = nodeFileSystem,
    private readonly now: () => number = Date.now,
  ) {}

  activePath(): string {
    return this.repository.activePath();
  }

  async exportData(): Promise<FileOperationResult> {
    const chosen = await this.dialog.showSaveDialog({
      title: "Export Kopper data",
      defaultPath: "kopper-export.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (chosen.canceled || chosen.filePath === undefined) {
      return { ok: true, value: { cancelled: true } };
    }

    const parsed = parseDocument(this.repository.snapshot());
    if (!parsed.ok) return parsed;
    try {
      await this.fileSystem.writeFile(
        chosen.filePath,
        `${JSON.stringify(parsed.value, null, 2)}\n`,
      );
      return {
        ok: true,
        value: { cancelled: false, fileName: basename(chosen.filePath) },
      };
    } catch (error) {
      return failure("write_failed", `The export could not be written: ${describe(error)}`);
    }
  }

  async chooseImport(): Promise<Result<DataImportPreview | null, KopperError>> {
    const chosen = await this.dialog.showOpenDialog({
      title: "Choose Kopper data",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (chosen.canceled || chosen.filePaths.length === 0) {
      return { ok: true, value: null };
    }

    const path = chosen.filePaths[0];
    let raw: Buffer;
    try {
      raw = await this.fileSystem.readFile(path);
    } catch (error) {
      return failure("read_failed", `The import could not be read: ${describe(error)}`);
    }

    let input: unknown;
    try {
      input = JSON.parse(raw.toString("utf8"));
    } catch {
      return failure("invalid_document", "The selected file is not valid JSON.");
    }
    const parsed = parseDocument(input);
    if (!parsed.ok) return parsed;

    this.removeExpiredImports();
    const token = randomUUID();
    const expirationTimer = setTimeout(() => {
      this.pendingImports.delete(token);
    }, FIVE_MINUTES);
    expirationTimer.unref?.();
    this.pendingImports.set(token, {
      document: parsed.value,
      expiresAt: this.now() + FIVE_MINUTES,
      expirationTimer,
    });
    return {
      ok: true,
      value: {
        token,
        fileName: basename(path),
        noteCount: parsed.value.notes.length,
        sectionCount: parsed.value.sections.length,
      },
    };
  }

  async confirmImport(token: string): Promise<Result<KopperDocument, KopperError>> {
    const pending = this.pendingImports.get(token);
    this.pendingImports.delete(token);
    if (pending !== undefined) clearTimeout(pending.expirationTimer);
    if (pending === undefined || pending.expiresAt <= this.now()) {
      return failure("validation_failed", "The import preview is unknown or has expired.");
    }
    return this.repository.replace(pending.document);
  }

  async exportRecoveryBytes(): Promise<FileOperationResult> {
    const raw = this.repository.recoveryBytes();
    if (raw === undefined) {
      return failure("validation_failed", "There is no damaged store content to export.");
    }
    const chosen = await this.dialog.showSaveDialog({
      title: "Export damaged Kopper data",
      defaultPath: "kopper-damaged-data.bin",
    });
    if (chosen.canceled || chosen.filePath === undefined) {
      raw.fill(0);
      return { ok: true, value: { cancelled: true } };
    }

    try {
      await this.fileSystem.writeFile(chosen.filePath, raw);
      return {
        ok: true,
        value: { cancelled: false, fileName: basename(chosen.filePath) },
      };
    } catch (error) {
      return failure("write_failed", `The damaged content could not be exported: ${describe(error)}`);
    } finally {
      raw.fill(0);
    }
  }

  createNewStore(): Promise<Result<KopperDocument, KopperError>> {
    return this.repository.createNewStore();
  }

  private removeExpiredImports(): void {
    const now = this.now();
    for (const [token, pending] of this.pendingImports) {
      if (pending.expiresAt <= now) {
        clearTimeout(pending.expirationTimer);
        this.pendingImports.delete(token);
      }
    }
  }
}
