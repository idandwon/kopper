import type { KopperDocument } from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import type { CaptureOutcome } from "../../shared/ipc/contract";
import type { CapturedNoteInput } from "../domain/commandService";

export interface CaptureSelectionPort {
  capture(): Promise<Result<string, KopperError>>;
}

export interface CaptureCommandPort {
  addCapturedNote(
    input: CapturedNoteInput,
  ): Promise<Result<KopperDocument, KopperError>>;
}

export interface CaptureRepositoryPort {
  currentResult(): Result<KopperDocument, KopperError>;
}

export interface CaptureCoordinatorOptions {
  createId(): string;
  publish(outcome: CaptureOutcome): void;
  repositoryBecameUnhealthy?(): void;
}

const unexpectedCaptureFailure = (): KopperError => ({
  code: "capture_failed",
  message: "Kopper could not capture the selected text.",
  retryable: true,
});

function unavailableRepositoryError(error: KopperError): KopperError {
  return {
    code: "capture_failed",
    message: "Kopper cannot capture until its document store is available.",
    retryable: error.retryable,
    ...(error.recoveryAction === undefined
      ? {}
      : { recoveryAction: error.recoveryAction }),
  };
}

function sanitizeCommandError(error: KopperError): KopperError {
  if (error.code === "write_failed") {
    return {
      code: "write_failed",
      message: "Captured text could not be saved.",
      retryable: error.retryable,
      ...(error.recoveryAction === undefined
        ? {}
        : { recoveryAction: error.recoveryAction }),
    };
  }
  return unexpectedCaptureFailure();
}

export class CaptureCoordinator {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly selectionCapture: CaptureSelectionPort,
    private readonly commandService: CaptureCommandPort,
    private readonly repository: CaptureRepositoryPort,
    private readonly options: CaptureCoordinatorOptions,
  ) {}

  requestCapture(): Promise<CaptureOutcome> {
    const request = this.tail.then(() => this.captureNow());
    this.tail = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  }

  private async captureNow(): Promise<CaptureOutcome> {
    try {
      const repository = this.repository.currentResult();
      if (!repository.ok) {
        this.markRepositoryUnhealthy();
        return this.finish({
          status: "failed",
          error: unavailableRepositoryError(repository.error),
        });
      }

      const capture = await this.selectionCapture.capture();
      if (!capture.ok) {
        return this.finish(
          capture.error.code === "nothing_selected"
            ? { status: "empty" }
            : { status: "failed", error: structuredClone(capture.error) },
        );
      }

      const noteId = this.options.createId();
      const persisted = await this.commandService.addCapturedNote({
        id: noteId,
        body: capture.value,
      });
      if (!persisted.ok) {
        if (
          persisted.error.code === "write_failed" &&
          !persisted.error.retryable
        ) {
          this.markRepositoryUnhealthy();
        }
        return this.finish({
          status: "failed",
          error: sanitizeCommandError(persisted.error),
        });
      }

      return this.finish({ status: "captured", noteId });
    } catch {
      return this.finish({ status: "failed", error: unexpectedCaptureFailure() });
    }
  }

  private markRepositoryUnhealthy(): void {
    try {
      this.options.repositoryBecameUnhealthy?.();
    } catch {
      // Health publication is best effort; capture remains disabled by the getter.
    }
  }

  private finish(outcome: CaptureOutcome): CaptureOutcome {
    const safeOutcome = structuredClone(outcome);
    try {
      this.options.publish(safeOutcome);
    } catch {
      // Renderer publication cannot reject or poison the serialized queue.
    }
    return safeOutcome;
  }
}
