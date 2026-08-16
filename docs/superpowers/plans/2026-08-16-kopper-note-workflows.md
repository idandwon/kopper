# Kopper Note Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the persisted shell into a keyboard-complete note, section, search, completion, merge, copy, import, export, and recovery application.

**Architecture:** Pure shared-domain commands produce validated next documents; a main-process command service persists them before publishing snapshots. The renderer maintains only view state such as query, focus, and selection, and sends typed intent through the preload bridge.

**Tech Stack:** Electron, React, TypeScript, Zod, shadcn/ui, Radix primitives, react-markdown, Vitest, Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-08-16-kopper-design.md`

## Global Constraints

- Complete every task in `docs/superpowers/plans/2026-08-16-kopper-foundation.md` first.
- Target macOS 14 Sonoma and later.
- The main process remains the sole owner of persistence, clipboard access, file dialogs, and mutations.
- Renderer actions must not imply success until the repository acknowledges persistence.
- Preserve one persistent `kopper.json` store; imports replace it only after complete validation and explicit confirmation.
- Keep active and completed notes searchable and fully keyboard accessible.
- Use test-driven development and commit after every task.

---

## Locked File Structure

```text
src/shared/domain/commands.ts             Command schema and pure document transitions
src/main/domain/commandService.ts         Persistence-before-publication orchestration and undo
src/main/files/documentFiles.ts           Explicit data import/export
src/shared/ipc/contract.ts                Command and file-operation bridge contracts
src/main/ipc/registerIpcHandlers.ts       Command and file-operation handlers
src/preload/index.ts                      Typed renderer bridge
src/renderer/src/app/DocumentProvider.tsx Document snapshot and command context
src/renderer/src/app/App.tsx              Routed panel composition
src/renderer/src/features/search/*        Search query and filtered projections
src/renderer/src/features/sections/*      Section headings and management dialogs
src/renderer/src/features/notes/*         Composer, cards, selection, menus, and actions
src/renderer/src/features/editor/*        Inline and expanded Markdown editing
src/renderer/src/features/completed/*     Completed-note view and restore
src/renderer/src/features/recovery/*      Invalid-store recovery actions
src/renderer/src/features/settings/DataSettings.tsx Data import/export controls
```

## Task 1: Implement Pure Document Commands

**Files:**

- Create: `src/shared/domain/commands.test.ts`
- Create: `src/shared/domain/commands.ts`

**Interfaces:**

- Consumes: `KopperDocument`, `Note`, `Section`, and `parseDocument` from `src/shared/domain/document.ts`.
- Produces: `DocumentCommandSchema`, `DocumentCommand`, `CommandContext`, `applyDocumentCommand(document, command, context): Result<KopperDocument, KopperError>`, and `isUndoable(command): boolean`.

- [ ] **Step 1: Write failing note-command tests**

Cover exact transitions for:

```ts
const context = {
  now: () => "2026-08-16T12:00:00.000Z",
  createId: vi.fn()
    .mockReturnValueOnce("note-1")
    .mockReturnValueOnce("note-2"),
};

expect(applyDocumentCommand(document, {
  type: "note.add",
  sectionId: inbox.id,
  body: "First prompt",
}, context)).toEqual({
  ok: true,
  value: expect.objectContaining({
    notes: [expect.objectContaining({ id: "note-1", body: "First prompt", order: 0 })],
  }),
});
```

Also assert that whitespace-only add fails, edit preserves `createdAt`, moving compacts both sections, complete stores `previousPlacement`, restore uses it, delete compacts ordering, merge follows displayed order, and all input documents remain unchanged.

- [ ] **Step 2: Write failing section-command tests**

Cover add, rename, reorder, set active, and deletion. Deleting a non-empty section without `destinationSectionId` must return `validation_failed`; deleting with a destination moves active notes and preserves completed-note restoration metadata where possible.

- [ ] **Step 3: Run command tests and verify failure**

Run: `pnpm vitest run src/shared/domain/commands.test.ts`

Expected: FAIL because `commands.ts` does not exist.

- [ ] **Step 4: Define and validate the command union**

```ts
export type DocumentCommand =
  | { type: "note.add"; id?: string; sectionId: string; body: string }
  | { type: "note.edit"; noteId: string; body: string }
  | { type: "note.move"; noteIds: string[]; destinationSectionId: string; destinationOrder: number }
  | { type: "note.complete"; noteIds: string[] }
  | { type: "note.restore"; noteIds: string[] }
  | { type: "note.delete"; noteIds: string[] }
  | { type: "note.merge"; noteIds: string[] }
  | { type: "section.add"; title: string }
  | { type: "section.rename"; sectionId: string; title: string }
  | { type: "section.reorder"; sectionId: string; destinationOrder: number }
  | { type: "section.delete"; sectionId: string; destinationSectionId?: string }
  | { type: "section.activate"; sectionId: string }
  | { type: "draft.set"; body: string; sectionId: string }
  | { type: "draft.clear" };
```

Use Zod to reject an optional add ID unless it is a UUID, empty ID arrays, duplicate note IDs, empty section titles, whitespace-only note bodies, and negative destination orders before applying a command. `note.add` uses its supplied ID when present and otherwise calls `context.createId()`; this lets main-process capture correlate its persisted note without requiring renderer-generated IDs.

- [ ] **Step 5: Implement immutable transitions**

Implement one private function per command family, plus `normalizeOrders`. Use `structuredClone(document)` once, apply the transition, update affected timestamps from `context.now()`, then call `parseDocument` before returning success. Merge joins trimmed note bodies with `"\n\n"`, keeps the earliest displayed note as the merged note, deletes the other selected notes, and compacts ordering.

- [ ] **Step 6: Run command tests and type checking**

Run:

```bash
pnpm vitest run src/shared/domain/commands.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit domain commands**

```bash
git add src/shared/domain/commands.ts src/shared/domain/commands.test.ts
 git commit -m "feat: add note and section domain commands"
```

## Task 2: Persist Commands Before Publishing UI State

**Files:**

- Create: `src/main/domain/commandService.test.ts`
- Create: `src/main/domain/commandService.ts`
- Modify: `src/shared/ipc/contract.test.ts`
- Modify: `src/shared/ipc/contract.ts`
- Modify: `src/main/ipc/registerIpcHandlers.test.ts`
- Modify: `src/main/ipc/registerIpcHandlers.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/app/DocumentProvider.test.tsx`
- Create: `src/renderer/src/app/DocumentProvider.tsx`
- Delete: `src/renderer/src/app/useDocument.ts`
- Delete: `src/renderer/src/app/useDocument.test.tsx`

**Interfaces:**

- Consumes: `applyDocumentCommand`, `NoteRepository.replace`, and existing document IPC.
- Produces: `CommandService.execute(command): Promise<Result<KopperDocument, KopperError>>`, `CommandService.undo()`, `window.kopper.execute(command)`, `window.kopper.undo()`, and `useKopperDocument()`.

- [ ] **Step 1: Write failing command-service tests**

Assert persistence-before-publication:

```ts
it("publishes only after persistence succeeds", async () => {
  const service = makeService();
  repository.replace.mockResolvedValue({ ok: true, value: changedDocument });
  await service.execute(command);
  expect(repository.replace.mock.invocationCallOrder[0])
    .toBeLessThan(publish.mock.invocationCallOrder[0]);
  expect(publish).toHaveBeenCalledWith(changedDocument);
});

it("keeps the current snapshot and publishes nothing when persistence fails", async () => {
  repository.replace.mockResolvedValue({ ok: false, error: writeError });
  const result = await service.execute(command);
  expect(result).toEqual({ ok: false, error: writeError });
  expect(publish).not.toHaveBeenCalled();
});
```

Test a 20-entry session undo stack. Only edit, move, complete, restore, delete, merge, section reorder, and section delete push undo snapshots. A successful undo persists the previous snapshot before publishing it.

- [ ] **Step 2: Run the service tests and verify failure**

Run: `pnpm vitest run src/main/domain/commandService.test.ts`

Expected: FAIL because `CommandService` does not exist.

- [ ] **Step 3: Implement `CommandService`**

Inject repository, `now`, `createId`, and `publish`. Serialize `execute` and `undo` calls through a promise queue so two renderer actions cannot race. Store cloned pre-command snapshots only after a command is valid and persistence succeeds.

- [ ] **Step 4: Extend the IPC contract with commands and undo**

Add channels:

```ts
executeCommand: "kopper:command:execute",
undo: "kopper:command:undo",
```

Extend `KopperApi` with:

```ts
execute(command: DocumentCommand): Promise<Result<KopperDocument, KopperError>>;
undo(): Promise<Result<KopperDocument, KopperError>>;
```

Parse commands in the main handler with `DocumentCommandSchema.safeParse`; never trust preload or renderer validation alone.

- [ ] **Step 5: Write failing provider tests**

Assert that `execute` exposes a pending action, replaces the document only on success, preserves it on error, and clears the error after a later success. A retryable failure stores the exact failed command; `retryLastAction` re-executes it and clears it only after success. Verify the provider subscribes once and unsubscribes on unmount.

- [ ] **Step 6: Implement `DocumentProvider`**

Expose:

```ts
interface KopperDocumentContextValue {
  document: KopperDocument;
  pendingAction: string | null;
  error: KopperError | null;
  execute(command: DocumentCommand): Promise<boolean>;
  undo(): Promise<boolean>;
  retryLastAction(): Promise<boolean>;
  clearError(): void;
}
```

Replace the foundation `useDocument` hook with this provider. Do not optimistically mutate the document.

- [ ] **Step 7: Run service, IPC, provider, and build checks**

Run:

```bash
pnpm vitest run src/main/domain src/shared/ipc src/main/ipc src/renderer/src/app/DocumentProvider.test.tsx
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit command orchestration**

```bash
git add src/main/domain src/shared/ipc src/main/ipc src/preload src/renderer/src/app
 git commit -m "feat: persist document commands through typed IPC"
```

## Task 3: Build Search, Sections, and the Composer

**Files:**

- Create: `src/renderer/src/features/search/projectNotes.test.ts`
- Create: `src/renderer/src/features/search/projectNotes.ts`
- Create: `src/renderer/src/features/search/SearchField.test.tsx`
- Create: `src/renderer/src/features/search/SearchField.tsx`
- Create: `src/renderer/src/features/sections/SectionGroup.test.tsx`
- Create: `src/renderer/src/features/sections/SectionGroup.tsx`
- Create: `src/renderer/src/features/sections/SectionManager.test.tsx`
- Create: `src/renderer/src/features/sections/SectionManager.tsx`
- Create: `src/renderer/src/features/notes/NoteComposer.test.tsx`
- Create: `src/renderer/src/features/notes/NoteComposer.tsx`
- Modify: `src/renderer/src/app/App.test.tsx`
- Modify: `src/renderer/src/app/App.tsx`

**Interfaces:**

- Consumes: `useKopperDocument()`, `DocumentCommand`, and persisted section/note ordering.
- Produces: `projectNotes(document, query, view): SectionProjection[]`, controlled `SearchField`, section management UI, and a draft-persisting `NoteComposer`.

- [ ] **Step 1: Write failing projection tests**

Test case-insensitive substring search across Markdown source, active-only projection, completed-only projection, stable section and note ordering, empty sections hidden only during non-empty search, and whitespace-only query treated as empty.

- [ ] **Step 2: Implement `projectNotes`**

Return immutable projections:

```ts
interface SectionProjection {
  section: Section;
  notes: Note[];
}
```

Never mutate or sort arrays from the persisted document in place.

- [ ] **Step 3: Write failing composer tests**

Assert that typing persists `draft.set` after a 250 ms debounce, Cmd+Enter sends `note.add` followed by `draft.clear` only after add succeeds, Enter inserts a newline, whitespace-only content cannot submit, and a failed add retains the draft.

- [ ] **Step 4: Implement the composer**

Use a labeled multiline textarea styled as the bottom Oxide Ledger card. Initialize it from `document.draft` when the draft section still exists, otherwise target `activeSectionId`. Cancel the debounce on unmount only after flushing the current draft through `execute`.

- [ ] **Step 5: Write failing search and section tests**

Assert Cmd+K focuses search, Escape clears a non-empty query before dismissing focus, section headings expose note counts, activating a heading sends `section.activate`, and deleting a non-empty section requires a destination selection.

- [ ] **Step 6: Implement search and section management**

Use shadcn `Dialog`, `DropdownMenu`, and `AlertDialog` primitives. Add them with:

```bash
pnpm dlx shadcn@latest add dialog dropdown-menu alert-dialog
```

Section creation and rename trim outer whitespace. Reordering uses explicit Move Up and Move Down commands in milestone one; pointer drag-and-drop is not required by the spec.

- [ ] **Step 7: Compose the active panel**

`App` owns only `query` and `view: "active" | "completed"`. Render the lifecycle rail, `SearchField`, projected `SectionGroup` components, global error alert, undo action, and `NoteComposer`. A retryable global error renders a persistent Retry button wired to `retryLastAction`; non-retryable errors omit it. Cmd+K must work when focus is outside a text editor.

- [ ] **Step 8: Run renderer tests and type checking**

Run:

```bash
pnpm vitest run src/renderer/src/features/search src/renderer/src/features/sections src/renderer/src/features/notes/NoteComposer.test.tsx src/renderer/src/app/App.test.tsx
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit search, sections, and composer**

```bash
git add src/renderer/src package.json pnpm-lock.yaml
 git commit -m "feat: add searchable sections and note composer"
```

## Task 4: Add Note Selection and Batch Actions

**Files:**

- Create: `src/renderer/src/features/notes/selectionReducer.test.ts`
- Create: `src/renderer/src/features/notes/selectionReducer.ts`
- Create: `src/renderer/src/features/notes/NoteCard.test.tsx`
- Create: `src/renderer/src/features/notes/NoteCard.tsx`
- Create: `src/renderer/src/features/notes/NoteContextMenu.test.tsx`
- Create: `src/renderer/src/features/notes/NoteContextMenu.tsx`
- Create: `src/main/clipboard/noteClipboard.test.ts`
- Create: `src/main/clipboard/noteClipboard.ts`
- Modify: `src/shared/ipc/contract.ts`
- Modify: `src/main/ipc/registerIpcHandlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/features/sections/SectionGroup.tsx`

**Interfaces:**

- Consumes: displayed note IDs, document commands, Electron clipboard, and the typed preload bridge.
- Produces: `selectionReducer(state, action)`, accessible `NoteCard`, `NoteContextMenu`, `formatNotesForClipboard(notes, mode)`, and `window.kopper.copyNotes(noteIds, mode)`.

- [ ] **Step 1: Write failing selection-reducer tests**

Cover single click, Cmd-click toggle, Shift-click contiguous range from anchor, arrow-key focus movement, Shift+Arrow range extension, clearing selection when filtered notes disappear, and keeping focus distinct from selection.

Use:

```ts
interface SelectionState {
  focusedId: string | null;
  anchorId: string | null;
  selectedIds: string[];
}
```

- [ ] **Step 2: Implement the selection reducer**

Accept the current displayed ID ordering in each action that needs range semantics. Preserve selected IDs in displayed order rather than click order.

- [ ] **Step 3: Write failing clipboard-format tests**

Assert plain copy joins multiple note bodies with two newlines. Markdown-list copy prefixes each note’s first line with the literal string `"- "` and prefixes continuation lines with two spaces. Empty IDs return `validation_failed` and completed status does not alter copied text.

- [ ] **Step 4: Implement clipboard formatting and IPC**

Resolve IDs against the current repository snapshot in the main process, preserve displayed order, call `clipboard.writeText`, and return a structured success result. Add `copyNotes(noteIds, mode: "plain" | "markdown-list")` to `KopperApi`.

- [ ] **Step 5: Write failing card and context-menu tests**

Assert semantic button/card roles, visible focus, separate selected styling, Space completion outside editors, Delete deletion, Cmd+C plain copy, Shift+Cmd+C list copy, Shift+Cmd+M merge, and context-menu items that disappear when fewer than two notes are selected.

- [ ] **Step 6: Implement cards, shortcuts, and menu actions**

Use shadcn `ContextMenu`:

```bash
pnpm dlx shadcn@latest add context-menu
```

The menu exposes Copy, Copy as list, Mark as done or Restore, Expand, Edit, Edit in new window, Merge notes, Move to, and Delete only when applicable. Stop keyboard shortcuts inside textareas, inputs, contenteditable elements, and dialogs except Escape and explicit editor-save shortcuts.

- [ ] **Step 7: Run note interaction tests**

Run:

```bash
pnpm vitest run src/renderer/src/features/notes src/main/clipboard
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit note actions**

```bash
git add src/renderer/src/features/notes src/renderer/src/features/sections src/main/clipboard src/shared/ipc src/main/ipc src/preload package.json pnpm-lock.yaml
 git commit -m "feat: add keyboard-first note actions"
```

## Task 5: Add Editing, Completed Notes, Import, Export, and Recovery

**Files:**

- Create: `src/renderer/src/features/editor/MarkdownEditor.test.tsx`
- Create: `src/renderer/src/features/editor/MarkdownEditor.tsx`
- Create: `src/renderer/src/features/editor/ExpandedEditorWindow.tsx`
- Create: `src/renderer/src/features/completed/CompletedView.test.tsx`
- Create: `src/renderer/src/features/completed/CompletedView.tsx`
- Create: `src/main/files/documentFiles.test.ts`
- Create: `src/main/files/documentFiles.ts`
- Create: `src/renderer/src/features/settings/DataSettings.test.tsx`
- Create: `src/renderer/src/features/settings/DataSettings.tsx`
- Create: `src/renderer/src/features/recovery/RecoveryScreen.test.tsx`
- Create: `src/renderer/src/features/recovery/RecoveryScreen.tsx`
- Modify: `src/shared/ipc/contract.ts`
- Modify: `src/main/ipc/registerIpcHandlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/createMainWindow.ts`
- Modify: `src/renderer/src/app/App.tsx`

**Interfaces:**

- Consumes: note edit/restore commands, `NoteRepository`, Electron `dialog`, and the existing error state.
- Produces: inline and expanded Markdown editing, completed-note projection, `DocumentFiles.exportTo(path)`, `DocumentFiles.chooseImport()`, `DocumentFiles.confirmImport(token)`, explicit data settings, and non-destructive recovery UI.

- [ ] **Step 1: Install Markdown rendering and write failing editor tests**

Run: `pnpm add react-markdown remark-gfm`

Test that Return enters editing from a focused card, Cmd+Enter persists `note.edit`, Escape discards edits after confirmation when dirty, blank content cannot save, and “Edit in new window” opens exactly one editor window per note ID.

- [ ] **Step 2: Implement inline and expanded editors**

Use one `MarkdownEditor` component in both surfaces. Preview Markdown through `react-markdown` with raw HTML disabled. The expanded editor window receives only a note ID in its URL fragment, then requests current data through the same preload bridge; no note body is placed in a URL.

- [ ] **Step 3: Write failing completed-view tests**

Assert active notes are absent, completed notes sort by `completedAt` descending inside their original section headings, query filtering works, restore sends `note.restore`, and missing original sections restore to the first current section.

- [ ] **Step 4: Implement Completed view**

Add an accessible Active/Completed segmented control. Hide the composer in Completed. Reuse `NoteCard` and selection behavior with Restore replacing Complete.

- [ ] **Step 5: Write failing document-file tests**

Using fake dialog results and temporary paths, assert export writes a pretty-printed validated snapshot, cancelled dialogs return a non-error cancelled result, invalid import never calls `repository.replace`, choosing a valid import returns a preview token plus file name and note/section counts without replacing data, confirming that token replaces the repository once, expired or unknown tokens fail, and malformed current-store raw bytes can be exported unchanged.

- [ ] **Step 6: Implement explicit import/export and recovery IPC**

`DocumentFiles` receives repository, `dialog`, and filesystem adapters. Add preload methods:

```ts
exportData(): Promise<FileOperationResult>;
chooseDataImport(): Promise<Result<DataImportPreview | null, KopperError>>;
confirmDataImport(token: string): Promise<Result<KopperDocument, KopperError>>;
exportRecoveryBytes(): Promise<FileOperationResult>;
createNewStore(): Promise<Result<KopperDocument, KopperError>>;
```

Use native open/save dialogs. `chooseDataImport` parses and validates the selected file, stores the validated document in an in-memory one-use token map for at most five minutes, and returns only its token, file name, and note/section counts. After the renderer confirms those details, `confirmDataImport(token)` atomically replaces the active store and consumes the token.

- [ ] **Step 7: Implement data settings and recovery screens**

`DataSettings` exposes Export and Import with explicit outcome messages. `RecoveryScreen` appears when initial load failed and offers Choose another file, Export damaged content, or Create new store. It must display the active path and state that Kopper will not overwrite the damaged file automatically.

- [ ] **Step 8: Run workflow verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit complete note workflows**

```bash
git add src package.json pnpm-lock.yaml tests
 git commit -m "feat: complete local note workflows"
```

## Milestone Acceptance

Run:

```bash
pnpm test && pnpm typecheck && pnpm build && pnpm test:e2e
```

Then manually verify in the development build that notes and sections can be created, edited, searched, reordered, selected, copied, merged, completed, restored, moved, deleted, undone, exported, and imported; relaunch must preserve the acknowledged state.
