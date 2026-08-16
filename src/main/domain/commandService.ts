import {
  applyDocumentCommand,
  isUndoable,
  type DocumentCommand,
} from "../../shared/domain/commands";
import type { KopperDocument } from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import {
  MainOperationCoordinator,
  type MainOperationRunner,
} from "./mainOperationCoordinator";

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

export interface CapturedNoteInput {
  id: string;
  body: string;
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

  constructor(
    private readonly repository: CommandRepository,
    private readonly options: CommandServiceOptions,
    private readonly operationCoordinator: MainOperationRunner = new MainOperationCoordinator(),
  ) {}

  execute(
    command: DocumentCommand,
  ): Promise<Result<KopperDocument, KopperError>> {
    return this.operationCoordinator.run(() => this.executeNow(command));
  }

  addCapturedNote(
    input: CapturedNoteInput,
  ): Promise<Result<KopperDocument, KopperError>> {
    return this.operationCoordinator.run(() => {
      const current = this.repository.snapshot();
      return this.executeNow(
        {
          type: "note.add",
          id: input.id,
          sectionId: current.activeSectionId,
          body: input.body,
        },
        current,
      );
    });
  }

  undo(): Promise<Result<KopperDocument, KopperError>> {
    return this.operationCoordinator.run(() => this.undoNow());
  }

  clearUndoHistory(): void {
    this.undoStack.length = 0;
  }

  private async executeNow(
    command: DocumentCommand,
    current: KopperDocument = this.repository.snapshot(),
  ): Promise<Result<KopperDocument, KopperError>> {
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

    this.publishSafely(persisted.value);
    return persisted;
  }

  private async undoNow(): Promise<Result<KopperDocument, KopperError>> {
    const previous = this.undoStack.at(-1);
    if (previous === undefined) return nothingToUndo();

    const current = this.repository.snapshot();
    const restored = structuredClone(previous);
    restored.draft = structuredClone(current.draft);
    restored.appearance = structuredClone(current.appearance);
    restored.customThemes = structuredClone(current.customThemes);
    restored.shortcuts = structuredClone(current.shortcuts);
    restored.window = structuredClone(current.window);
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
    this.publishSafely(persisted.value);
    return persisted;
  }

  private publishSafely(document: KopperDocument): void {
    try {
      this.options.publish(document);
    } catch {
      // Persistence acknowledgement is authoritative if a renderer disappears.
    }
  }
}
