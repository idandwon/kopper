import {
  applyDocumentCommand,
  isUndoable,
  type DocumentCommand,
} from "../../shared/domain/commands";
import type { KopperDocument } from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";

const UNDO_LIMIT = 20;
const undoClearingTypes = new Set<DocumentCommand["type"]>([
  "note.add",
  "section.add",
  "section.rename",
]);

export interface CommandRepository {
  snapshot(): KopperDocument;
  replace(
    document: KopperDocument,
  ): Promise<Result<KopperDocument, KopperError>>;
}

export interface CommandServiceOptions {
  now(): string;
  createId(): string;
  publish(document: KopperDocument): void;
}

const nothingToUndo = (): Result<KopperDocument, KopperError> => ({
  ok: false,
  error: {
    code: "validation_failed",
    message: "There is no document action to undo.",
    retryable: false,
  },
});

export class CommandService {
  private readonly undoStack: KopperDocument[] = [];
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: CommandRepository,
    private readonly options: CommandServiceOptions,
  ) {}

  execute(
    command: DocumentCommand,
  ): Promise<Result<KopperDocument, KopperError>> {
    return this.enqueue(() => this.executeNow(command));
  }

  undo(): Promise<Result<KopperDocument, KopperError>> {
    return this.enqueue(() => this.undoNow());
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async executeNow(
    command: DocumentCommand,
  ): Promise<Result<KopperDocument, KopperError>> {
    const current = this.repository.snapshot();
    const applied = applyDocumentCommand(current, command, {
      now: this.options.now,
      createId: this.options.createId,
    });
    if (!applied.ok) return applied;

    const persisted = await this.repository.replace(applied.value);
    if (!persisted.ok) return persisted;

    if (isUndoable(command)) {
      this.undoStack.push(structuredClone(current));
      if (this.undoStack.length > UNDO_LIMIT) {
        this.undoStack.shift();
      }
    } else if (undoClearingTypes.has(command.type)) {
      this.undoStack.length = 0;
    }

    this.options.publish(persisted.value);
    return persisted;
  }

  private async undoNow(): Promise<Result<KopperDocument, KopperError>> {
    const previous = this.undoStack.at(-1);
    if (previous === undefined) return nothingToUndo();

    const current = this.repository.snapshot();
    const restored = structuredClone(previous);
    restored.draft = structuredClone(current.draft);
    if (
      restored.sections.some(
        (section) => section.id === current.activeSectionId,
      )
    ) {
      restored.activeSectionId = current.activeSectionId;
    }

    const persisted = await this.repository.replace(restored);
    if (!persisted.ok) return persisted;

    this.undoStack.pop();
    this.options.publish(persisted.value);
    return persisted;
  }
}
