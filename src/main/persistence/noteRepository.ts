import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import {
  createEmptyDocument,
  parseDocument,
  type KopperDocument,
} from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import { AtomicReplaceError, atomicReplace } from "./atomicFile";

export type AtomicWriter = (path: string, contents: string) => Promise<void>;

export type RepositoryReadResult = Result<KopperDocument, KopperError>;

export type RepositoryLoadResult =
  | { ok: true; value: KopperDocument; created: boolean }
  | { ok: false; error: KopperError };

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

function uncertainWriteError(): KopperError {
  return {
    code: "write_failed",
    message:
      "The Kopper document save could not be confirmed after the destination was replaced. Reload the store before saving again.",
    retryable: false,
  };
}

export class NoteRepository {
  private document: KopperDocument = createEmptyDocument();
  private currentError: KopperError | undefined;
  private rawRecoveryBytes: Buffer | undefined;
  private writeFailureLatch: KopperError | undefined;
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly atomicWriter: AtomicWriter = atomicReplace,
  ) {}

  load(): Promise<RepositoryLoadResult> {
    return this.enqueue(() => this.loadNow());
  }

  private async loadNow(): Promise<RepositoryLoadResult> {
    this.writeFailureLatch = undefined;

    let raw: Buffer;
    try {
      raw = await readFile(this.path);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return this.createStore();
      }

      const readError: KopperError = {
        code: "read_failed",
        message: `The Kopper document could not be read: ${describeError(error)}`,
        retryable: true,
        recoveryAction: "retry",
      };
      this.setError(readError);
      return { ok: false, error: structuredClone(readError) };
    }

    let input: unknown;
    try {
      input = JSON.parse(raw.toString("utf8"));
    } catch {
      const error: KopperError = {
        code: "invalid_document",
        message: "The Kopper document is not valid JSON.",
        retryable: false,
        recoveryAction: "choose_file",
      };
      this.setError(error, raw);
      return { ok: false, error: structuredClone(error) };
    }

    const parsed = parseDocument(input);
    if (!parsed.ok) {
      const error: KopperError = {
        ...parsed.error,
        recoveryAction: "choose_file",
      };
      this.setError(error, raw);
      return { ok: false, error: structuredClone(error) };
    }

    this.commit(parsed.value);
    return { ok: true, value: this.snapshot(), created: false };
  }

  currentResult(): RepositoryReadResult {
    if (this.currentError !== undefined) {
      return { ok: false, error: structuredClone(this.currentError) };
    }

    return { ok: true, value: this.snapshot() };
  }

  snapshot(): KopperDocument {
    return structuredClone(this.document);
  }

  replace(next: KopperDocument): Promise<Result<KopperDocument, KopperError>> {
    return this.enqueue(() => this.replaceNow(next));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async replaceNow(
    next: KopperDocument,
  ): Promise<Result<KopperDocument, KopperError>> {
    if (this.writeFailureLatch !== undefined) {
      return {
        ok: false,
        error: structuredClone(this.writeFailureLatch),
      };
    }

    const parsed = parseDocument(next);
    if (!parsed.ok) {
      return parsed;
    }

    return this.persist(parsed.value);
  }

  private async persist(
    document: KopperDocument,
  ): Promise<Result<KopperDocument, KopperError>> {
    try {
      await this.atomicWriter(this.path, serialize(document));
    } catch (error) {
      if (
        error instanceof AtomicReplaceError &&
        error.stage === "after_rename"
      ) {
        return this.reconcileCommittedWrite(document);
      }

      return { ok: false, error: writeError(error) };
    }

    this.commit(document);
    return { ok: true, value: this.snapshot() };
  }

  private async reconcileCommittedWrite(
    intended: KopperDocument,
  ): Promise<Result<KopperDocument, KopperError>> {
    try {
      const raw = await readFile(this.path);
      const parsed = parseDocument(JSON.parse(raw.toString("utf8")));
      if (parsed.ok && isDeepStrictEqual(parsed.value, intended)) {
        this.commit(parsed.value);
        return { ok: true, value: this.snapshot() };
      }
    } catch {
      // The destination cannot be trusted after rename; latch below.
    }

    const error = uncertainWriteError();
    this.writeFailureLatch = structuredClone(error);
    this.setError(error);
    return { ok: false, error: structuredClone(error) };
  }

  private async createStore(): Promise<RepositoryLoadResult> {
    const document = createEmptyDocument();
    const result = await this.persist(document);

    if (!result.ok) {
      this.setError(result.error);
      return { ok: false, error: structuredClone(result.error) };
    }

    return { ok: true, value: result.value, created: true };
  }

  private commit(document: KopperDocument): void {
    this.document = structuredClone(document);
    this.currentError = undefined;
    this.clearRecoveryBytes();
    this.writeFailureLatch = undefined;
  }

  private setError(error: KopperError, raw?: Buffer): void {
    this.currentError = structuredClone(error);
    this.clearRecoveryBytes();
    this.rawRecoveryBytes = raw === undefined ? undefined : Buffer.from(raw);
  }

  private clearRecoveryBytes(): void {
    this.rawRecoveryBytes?.fill(0);
    this.rawRecoveryBytes = undefined;
  }
}
