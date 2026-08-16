import { readFile } from "node:fs/promises";

import {
  createEmptyDocument,
  parseDocument,
  type KopperDocument,
} from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import { atomicReplace } from "./atomicFile";

export type AtomicWriter = (path: string, contents: string) => Promise<void>;

export type RepositoryLoadResult =
  | { ok: true; value: KopperDocument; created: boolean }
  | { ok: false; error: KopperError; raw?: Buffer };

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown filesystem error.";
}

function serialize(document: KopperDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function writeError(error: unknown): KopperError {
  return {
    code: "write_failed",
    message: `The Kopper document could not be saved: ${describeError(error)}`,
    retryable: true,
    recoveryAction: "retry",
  };
}

export class NoteRepository {
  private document: KopperDocument = createEmptyDocument();

  constructor(
    private readonly path: string,
    private readonly atomicWriter: AtomicWriter = atomicReplace,
  ) {}

  async load(): Promise<RepositoryLoadResult> {
    let raw: Buffer;
    try {
      raw = await readFile(this.path);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return this.createStore();
      }

      return {
        ok: false,
        error: {
          code: "read_failed",
          message: `The Kopper document could not be read: ${describeError(error)}`,
          retryable: true,
          recoveryAction: "retry",
        },
      };
    }

    let input: unknown;
    try {
      input = JSON.parse(raw.toString("utf8"));
    } catch {
      return {
        ok: false,
        error: {
          code: "invalid_document",
          message: "The Kopper document is not valid JSON.",
          retryable: false,
          recoveryAction: "choose_file",
        },
        raw,
      };
    }

    const parsed = parseDocument(input);
    if (!parsed.ok) {
      return {
        ok: false,
        error: { ...parsed.error, recoveryAction: "choose_file" },
        raw,
      };
    }

    this.document = structuredClone(parsed.value);
    return { ok: true, value: this.snapshot(), created: false };
  }

  snapshot(): KopperDocument {
    return structuredClone(this.document);
  }

  async replace(
    next: KopperDocument,
  ): Promise<Result<KopperDocument, KopperError>> {
    const parsed = parseDocument(next);
    if (!parsed.ok) {
      return parsed;
    }

    try {
      await this.atomicWriter(this.path, serialize(parsed.value));
    } catch (error) {
      return { ok: false, error: writeError(error) };
    }

    this.document = structuredClone(parsed.value);
    return { ok: true, value: this.snapshot() };
  }

  private async createStore(): Promise<RepositoryLoadResult> {
    const document = createEmptyDocument();

    try {
      await this.atomicWriter(this.path, serialize(document));
    } catch (error) {
      return { ok: false, error: writeError(error) };
    }

    this.document = structuredClone(document);
    return { ok: true, value: this.snapshot(), created: true };
  }
}
