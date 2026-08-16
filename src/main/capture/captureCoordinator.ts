import type { DocumentCommand } from "../../shared/domain/commands";
import type { KopperDocument } from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import type { CaptureOutcome } from "../../shared/ipc/contract";

export interface CaptureSelectionPort {
  capture(): Promise<Result<string, KopperError>>;
}

export interface CaptureCommandPort {
  execute(command: DocumentCommand): Promise<Result<KopperDocument, KopperError>>;
}

export interface CaptureDocumentPort {
  activeSectionId(): string;
}

export interface CaptureCoordinatorOptions {
  createId(): string;
  publish(outcome: CaptureOutcome): void;
}

const unexpectedCaptureFailure = (): KopperError => ({
  code: "capture_failed",
  message: "Kopper could not capture the selected text.",
  retryable: true,
});

function sanitizeCommandError(error: KopperError): KopperError {
  if (error.code === "write_failed") {
    return {
      code: "write_failed",
      message: "Captured text could not be saved.",
      retryable: true,
      recoveryAction: "retry",
    };
  }
  return {
    code: "capture_failed",
    message: "Kopper could not capture the selected text.",
    retryable: true,
  };
}

export class CaptureCoordinator {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly selectionCapture: CaptureSelectionPort,
    private readonly commandService: CaptureCommandPort,
    private readonly document: CaptureDocumentPort,
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
      const capture = await this.selectionCapture.capture();
      if (!capture.ok) {
        return this.finish(
          capture.error.code === "nothing_selected"
            ? { status: "empty" }
            : { status: "failed", error: structuredClone(capture.error) },
        );
      }

      const noteId = this.options.createId();
      const sectionId = this.document.activeSectionId();
      const persisted = await this.commandService.execute({
        type: "note.add",
        id: noteId,
        sectionId,
        body: capture.value,
      });
      if (!persisted.ok) {
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
