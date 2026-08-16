# Kopper Foundation and Local Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a secure, launchable Electron application with a validated local document, atomic persistence, typed IPC, and an Oxide Ledger shadcn/ui shell.

**Architecture:** The Electron main process owns persistence and exposes a narrow typed preload API. Shared Zod schemas define the document and IPC payloads, while the sandboxed React renderer reads snapshots through the bridge and renders semantic shadcn tokens.

**Tech Stack:** Electron, electron-vite, React, TypeScript, pnpm, Tailwind CSS, shadcn/ui, Zod, Vitest, Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-08-16-kopper-design.md`

## Global Constraints

- Target macOS 14 Sonoma and later.
- Use Electron with React and TypeScript; do not add a custom Swift helper.
- Keep `contextIsolation: true`, renderer sandboxing enabled, and `nodeIntegration: false`.
- Store user content and preferences in one versioned JSON document at `~/Library/Application Support/Kopper/kopper.json`.
- Do not add accounts, synchronization, analytics, telemetry, crash reporting, remote renderer content, or automatic updates.
- Use semantic shadcn CSS variables; component styles must not reference Oxide Ledger palette hex values directly.
- Use test-driven development and commit after every task.

---

## Locked File Structure

```text
package.json                         Project scripts and dependency manifest
pnpm-lock.yaml                      Reproducible dependency lock
components.json                     shadcn/ui generator configuration
electron.vite.config.ts             Main, preload, and renderer build configuration
electron-builder.yml                Unsigned development packaging baseline
tsconfig.json                       Shared TypeScript project references
tsconfig.node.json                  Main/preload compiler settings
tsconfig.web.json                   Renderer compiler settings
vitest.config.ts                    Node and jsdom test projects
playwright.config.ts                Electron end-to-end test settings
src/main/index.ts                   Electron lifecycle entry point
src/main/createMainWindow.ts        Secure BrowserWindow construction
src/main/ipc/registerIpcHandlers.ts Typed IPC registration
src/main/persistence/atomicFile.ts  Crash-safe same-directory replacement
src/main/persistence/noteRepository.ts Validated document loading and saving
src/preload/index.ts                Narrow contextBridge implementation
src/shared/appIdentity.ts           Stable app name and file location constants
src/shared/domain/document.ts       Versioned persisted-document schema
src/shared/domain/errors.ts         Structured application errors
src/shared/ipc/contract.ts          Channels, request schemas, and KopperApi type
src/renderer/index.html             Renderer HTML and Content Security Policy
src/renderer/src/main.tsx           React entry point
src/renderer/src/app/App.tsx        Root application shell
src/renderer/src/app/useDocument.ts Initial document subscription hook
src/renderer/src/components/ui/*    Generated shadcn primitives
src/renderer/src/styles/globals.css Tailwind and semantic theme tokens
tests/e2e/launch.spec.ts            Packaged Electron launch smoke test
```

## Task 1: Scaffold the Secure Electron Toolchain

**Files:**

- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `electron-builder.yml`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/shared/appIdentity.test.ts`
- Create: `src/shared/appIdentity.ts`
- Create: `src/main/index.ts`
- Create: `src/main/createMainWindow.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`

**Interfaces:**

- Consumes: None; this is the repository bootstrap.
- Produces: `APP_NAME: "Kopper"`, `STORE_FILE_NAME: "kopper.json"`, `createMainWindow(): BrowserWindow`, and working `pnpm test`, `pnpm typecheck`, `pnpm dev`, and `pnpm build` commands.

- [ ] **Step 1: Create the dependency manifest and install the toolchain**

```json
{
  "name": "kopper",
  "version": "0.1.0",
  "private": true,
  "description": "A local-first capture queue for macOS",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "pnpm typecheck && electron-vite build",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "package:dir": "pnpm build && electron-builder --dir --mac",
    "package:dmg": "pnpm build && electron-builder --mac dmg"
  },
  "packageManager": "pnpm@10.15.0"
}
```

Run:

```bash
corepack enable
pnpm add electron react react-dom zod
pnpm add -D electron-vite vite typescript @types/node @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test electron-builder tailwindcss @tailwindcss/vite
```

Expected: `pnpm-lock.yaml` is created and installation exits 0.

- [ ] **Step 2: Write the failing identity test**

```ts
import { describe, expect, it } from "vitest";
import { APP_NAME, STORE_FILE_NAME } from "./appIdentity";

describe("app identity", () => {
  it("uses stable user-visible and persistence names", () => {
    expect(APP_NAME).toBe("Kopper");
    expect(STORE_FILE_NAME).toBe("kopper.json");
  });
});
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run: `pnpm vitest run src/shared/appIdentity.test.ts`

Expected: FAIL because `src/shared/appIdentity.ts` does not exist.

- [ ] **Step 4: Add the identity module**

```ts
export const APP_NAME = "Kopper" as const;
export const STORE_FILE_NAME = "kopper.json" as const;
```

- [ ] **Step 5: Add TypeScript, electron-vite, Vitest, and Playwright configuration**

Configure three electron-vite targets. Apply `@tailwindcss/vite` only to the renderer. Configure Vitest with a Node project matching `src/{main,shared,preload}/**/*.test.ts` and a jsdom project matching `src/renderer/**/*.test.ts?(x)`. Configure Playwright to match `tests/e2e/**/*.spec.ts`, run serially on macOS, and retain traces on failure.

`electron-builder.yml` must contain:

```yaml
appId: com.kopper.app
productName: Kopper
files:
  - out/**
  - package.json
asar: true
mac:
  category: public.app-category.productivity
  target:
    - dir
  minimumSystemVersion: "14.0"
```

- [ ] **Step 6: Add a secure window and lifecycle entry point**

```ts
// src/main/createMainWindow.ts
import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 380,
    height: 640,
    minWidth: 340,
    minHeight: 480,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  window.once("ready-to-show", () => window.show());
  return window;
}
```

`src/main/index.ts` must set the app name, create the window after `app.whenReady()`, recreate it on `activate`, and quit on `window-all-closed` for macOS development until menu-bar lifecycle is added in the macOS integration plan.

- [ ] **Step 7: Add the renderer CSP and initial entry point**

Use this CSP in `src/renderer/index.html`:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'"
/>
```

Render a plain `<main>Kopper</main>` from `src/renderer/src/main.tsx`. Leave `src/preload/index.ts` empty except for an exported empty object so the preload bundle compiles before Task 4.

- [ ] **Step 8: Run the foundation checks**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit 0 and `out/main`, `out/preload`, and `out/renderer` exist.

- [ ] **Step 9: Commit the scaffold**

```bash
git add package.json pnpm-lock.yaml electron.vite.config.ts electron-builder.yml tsconfig*.json vitest.config.ts playwright.config.ts src
 git commit -m "build: scaffold secure Electron application"
```

## Task 2: Define the Versioned Kopper Document

**Files:**

- Create: `src/shared/domain/document.test.ts`
- Create: `src/shared/domain/document.ts`
- Create: `src/shared/domain/errors.ts`

**Interfaces:**

- Consumes: `APP_NAME` from `src/shared/appIdentity.ts` only for default display values.
- Produces: `KopperDocumentSchema`, `KopperDocument`, `Section`, `Note`, `ThemeDefinition`, `createEmptyDocument(now?: Date): KopperDocument`, `parseDocument(input: unknown): ParseDocumentResult`, and `KopperError`.

- [ ] **Step 1: Write failing schema tests**

Test these exact behaviors:

```ts
it("creates one Inbox section and no notes", () => {
  const document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));
  expect(document.schemaVersion).toBe(1);
  expect(document.sections).toEqual([
    expect.objectContaining({ title: "Inbox", order: 0 }),
  ]);
  expect(document.notes).toEqual([]);
  expect(document.activeSectionId).toBe(document.sections[0].id);
});

it("rejects a note that references a missing section", () => {
  const document = createEmptyDocument();
  const result = parseDocument({
    ...document,
    notes: [makeNote({ sectionId: "missing" })],
  });
  expect(result).toEqual(expect.objectContaining({ ok: false }));
});

it("returns unsupported_schema without mutating newer data", () => {
  const result = parseDocument({ schemaVersion: 99 });
  expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "unsupported_schema" }) });
});
```

The test helper `makeNote` must create a complete valid note fixture in the test file.

- [ ] **Step 2: Run the schema tests and verify failure**

Run: `pnpm vitest run src/shared/domain/document.test.ts`

Expected: FAIL because the document module does not exist.

- [ ] **Step 3: Implement the persisted schemas and defaults**

Define Zod schemas with these exact persisted fields:

```ts
export type AppearanceMode = "system" | "light" | "dark";

export interface Section {
  id: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotePlacement {
  sectionId: string;
  order: number;
}

export interface Note {
  id: string;
  sectionId: string;
  body: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  previousPlacement: NotePlacement | null;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  version: 1;
  light: Record<string, string>;
  dark: Record<string, string>;
}
```

The top-level version 1 document must contain `schemaVersion`, `sections`, `notes`, `activeSectionId`, `shortcuts`, `window`, `appearance`, `customThemes`, and nullable `draft`. Use `crypto.randomUUID()` for identifiers and ISO-8601 UTC strings for timestamps.

After Zod parsing, enforce domain refinements in `parseDocument`: unique identifiers, contiguous non-negative ordering per active section, one valid active section, and valid note section references. Completed notes may retain a deleted `sectionId` only when `previousPlacement` is non-null.

- [ ] **Step 4: Implement structured errors**

```ts
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type KopperErrorCode =
  | "invalid_document"
  | "unsupported_schema"
  | "read_failed"
  | "write_failed"
  | "validation_failed"
  | "permission_denied"
  | "capture_timeout"
  | "capture_failed"
  | "nothing_selected"
  | "shortcut_conflict";

export interface KopperError {
  code: KopperErrorCode;
  message: string;
  retryable: boolean;
  recoveryAction?: "retry" | "open_settings" | "choose_file" | "create_store";
}
```

- [ ] **Step 5: Run the schema suite**

Run: `pnpm vitest run src/shared/domain/document.test.ts`

Expected: PASS for defaults, valid round-trip parsing, duplicate IDs, invalid ordering, missing references, and unsupported schema.

- [ ] **Step 6: Commit the domain document**

```bash
git add src/shared/domain
 git commit -m "feat: define versioned Kopper document"
```

## Task 3: Implement Atomic Local Persistence

**Files:**

- Create: `src/main/persistence/atomicFile.test.ts`
- Create: `src/main/persistence/atomicFile.ts`
- Create: `src/main/persistence/noteRepository.test.ts`
- Create: `src/main/persistence/noteRepository.ts`

**Interfaces:**

- Consumes: `KopperDocument`, `createEmptyDocument`, `parseDocument`, `KopperError`, and `STORE_FILE_NAME`.
- Produces: `atomicReplace(path: string, contents: string): Promise<void>` and `NoteRepository` with `load(): Promise<RepositoryLoadResult>`, `snapshot(): KopperDocument`, and `replace(next: KopperDocument): Promise<Result<KopperDocument, KopperError>>`.

- [ ] **Step 1: Write failing atomic replacement tests**

Use a real temporary directory and inject filesystem operations so the failure path is deterministic. Assert:

```ts
it("replaces the destination and removes the temporary file", async () => {
  await atomicReplace(path, "next");
  expect(await readFile(path, "utf8")).toBe("next");
  expect(await readdir(directory)).toEqual(["kopper.json"]);
});

it("leaves the current document untouched when rename fails", async () => {
  await writeFile(path, "current");
  await expect(atomicReplace(path, "next", failingRenameFs)).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe("current");
});
```

- [ ] **Step 2: Run the atomic tests and verify failure**

Run: `pnpm vitest run src/main/persistence/atomicFile.test.ts`

Expected: FAIL because `atomicReplace` does not exist.

- [ ] **Step 3: Implement same-directory atomic replacement**

`atomicReplace` must write `${path}.tmp-${process.pid}`, open it with mode `0o600`, call `FileHandle.sync()`, close it, rename it over the destination, then open and sync the parent directory. Its cleanup path removes only the temporary file and ignores `ENOENT` during cleanup. `NoteRepository` receives its atomic writer as an optional constructor dependency so failure tests inject `failingAtomicReplace` without changing the public `replace(next)` signature.

- [ ] **Step 4: Run the atomic tests**

Run: `pnpm vitest run src/main/persistence/atomicFile.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing repository tests**

Cover:

```ts
it("creates and persists an empty document when the file is absent", async () => {
  const result = await repository.load();
  expect(result).toEqual({ ok: true, value: expect.objectContaining({ notes: [] }), created: true });
  expect(JSON.parse(await readFile(storePath, "utf8")).schemaVersion).toBe(1);
});

it("returns recovery bytes without overwriting malformed JSON", async () => {
  await writeFile(storePath, "{broken", "utf8");
  const result = await repository.load();
  expect(result).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "invalid_document", recoveryAction: "choose_file" }),
    raw: Buffer.from("{broken"),
  });
  expect(await readFile(storePath, "utf8")).toBe("{broken");
});

it("does not update the snapshot when persistence fails", async () => {
  const before = repository.snapshot();
  const result = await repository.replace(changedDocument);
  expect(result.ok).toBe(false);
  expect(repository.snapshot()).toEqual(before);
});
```

- [ ] **Step 6: Implement `NoteRepository`**

Resolve the default path with `join(app.getPath("userData"), STORE_FILE_NAME)` in the composition root and pass the path into the repository constructor. Keep Electron out of the repository module so tests run in Node. Parse before replacing, serialize with two-space indentation and a trailing newline, and clone snapshots with `structuredClone`.

- [ ] **Step 7: Run persistence tests and type checking**

Run:

```bash
pnpm vitest run src/main/persistence
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit persistence**

```bash
git add src/main/persistence
 git commit -m "feat: persist Kopper document atomically"
```

## Task 4: Expose a Typed, Validated Preload API

**Files:**

- Create: `src/shared/ipc/contract.test.ts`
- Create: `src/shared/ipc/contract.ts`
- Create: `src/main/ipc/registerIpcHandlers.test.ts`
- Create: `src/main/ipc/registerIpcHandlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/env.d.ts`

**Interfaces:**

- Consumes: `NoteRepository`, `KopperDocumentSchema`, and `KopperError`.
- Produces: `IPC_CHANNELS`, `KopperApi`, `registerIpcHandlers(repository, ipcMain): () => void`, and `window.kopper.getDocument()` plus `window.kopper.subscribeDocument(listener)`.

- [ ] **Step 1: Write failing IPC contract tests**

Assert that every channel starts with `kopper:` and that malformed result envelopes fail validation:

```ts
expect(Object.values(IPC_CHANNELS).every((value) => value.startsWith("kopper:"))).toBe(true);
expect(() => DocumentResultSchema.parse({ ok: true })).toThrow();
```

- [ ] **Step 2: Run the contract tests and verify failure**

Run: `pnpm vitest run src/shared/ipc/contract.test.ts`

Expected: FAIL because the contract does not exist.

- [ ] **Step 3: Define the first bridge contract**

```ts
export const IPC_CHANNELS = {
  getDocument: "kopper:document:get",
  documentChanged: "kopper:document:changed",
} as const;

export interface KopperApi {
  getDocument(): Promise<Result<KopperDocument, KopperError>>;
  subscribeDocument(listener: (document: KopperDocument) => void): () => void;
}
```

Define Zod envelopes for both success and error results. Export a `parseDocumentResult` function used by preload and renderer tests.

- [ ] **Step 4: Write failing handler tests**

Use a fake `ipcMain` with captured handlers. Assert that `getDocument` returns the loaded snapshot, that handler registration is idempotent after cleanup, and that repository errors return structured error envelopes.

- [ ] **Step 5: Implement handlers and preload bridge**

`registerIpcHandlers` must register only known channels and return a cleanup function that calls `removeHandler`. `src/preload/index.ts` must use `contextBridge.exposeInMainWorld("kopper", api)` and return an unsubscribe function that removes exactly the listener it added.

Declare:

```ts
declare global {
  interface Window {
    kopper: KopperApi;
  }
}
```

in `src/renderer/src/env.d.ts`.

- [ ] **Step 6: Compose repository and handlers in the main entry point**

After `app.whenReady()`, construct `NoteRepository(join(app.getPath("userData"), STORE_FILE_NAME))`, await `load()`, register IPC handlers, and create the window only after a successful load. For malformed data, still create the window and expose the structured load error so the recovery UI in the notes-workflow plan can render.

- [ ] **Step 7: Run IPC and build checks**

Run:

```bash
pnpm vitest run src/shared/ipc src/main/ipc
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit the secure bridge**

```bash
git add src/shared/ipc src/main/ipc src/main/index.ts src/preload/index.ts src/renderer/src/env.d.ts
 git commit -m "feat: expose typed document bridge"
```

## Task 5: Add shadcn/ui and the Oxide Ledger Shell

**Files:**

- Create: `components.json`
- Create: `src/renderer/src/styles/globals.css`
- Create: `src/renderer/src/lib/utils.ts`
- Create: `src/renderer/src/components/ui/button.tsx`
- Create: `src/renderer/src/components/ui/input.tsx`
- Create: `src/renderer/src/components/ui/scroll-area.tsx`
- Create: `src/renderer/src/app/useDocument.test.tsx`
- Create: `src/renderer/src/app/useDocument.ts`
- Create: `src/renderer/src/app/App.test.tsx`
- Create: `src/renderer/src/app/App.tsx`
- Modify: `src/renderer/src/main.tsx`
- Create: `tests/e2e/launch.spec.ts`

**Interfaces:**

- Consumes: `window.kopper.getDocument()`, `window.kopper.subscribeDocument()`, and the version 1 document shape.
- Produces: an accessible Oxide Ledger shell that renders sections and notes from the repository and a reusable `useDocument(): DocumentState` hook.

- [ ] **Step 1: Initialize shadcn/ui for the Electron renderer**

Run:

```bash
pnpm dlx shadcn@latest init --base-color neutral --css-variables
pnpm dlx shadcn@latest add button input scroll-area
```

Set aliases in `components.json` to `@renderer/components`, `@renderer/components/ui`, `@renderer/lib`, and `@renderer/hooks`. Ensure `tsconfig.web.json` and `electron.vite.config.ts` map `@renderer` to `src/renderer/src`.

- [ ] **Step 2: Write the failing document-hook test**

```tsx
it("loads a document and applies subsequent snapshots", async () => {
  window.kopper = fakeApi(initialDocument);
  const { result } = renderHook(() => useDocument());
  await waitFor(() => expect(result.current.status).toBe("ready"));
  act(() => emitDocument(changedDocument));
  expect(result.current.document).toEqual(changedDocument);
});
```

Also test the structured load-error state and listener cleanup on unmount.

- [ ] **Step 3: Run the hook test and verify failure**

Run: `pnpm vitest run src/renderer/src/app/useDocument.test.tsx`

Expected: FAIL because `useDocument` does not exist.

- [ ] **Step 4: Implement `useDocument`**

Use a discriminated union:

```ts
type DocumentState =
  | { status: "loading" }
  | { status: "ready"; document: KopperDocument }
  | { status: "error"; error: KopperError };
```

Subscribe before requesting the initial snapshot, ignore updates after unmount, and unsubscribe during effect cleanup.

- [ ] **Step 5: Write the failing app-shell test**

Render `App` with a ready document and assert:

```tsx
expect(screen.getByRole("searchbox", { name: "Search notes" })).toBeVisible();
expect(screen.getByRole("heading", { name: "Inbox" })).toBeVisible();
expect(screen.getByText("Captured note")).toBeVisible();
expect(screen.getByRole("textbox", { name: "Add a note or prompt" })).toBeVisible();
```

- [ ] **Step 6: Implement the semantic Oxide Ledger shell**

Define shadcn semantic tokens and Kopper lifecycle tokens in `globals.css`. Hex values may appear only in the `:root` and `.dark` token declarations. App and component classes must use semantic utilities such as `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, and CSS variables `var(--capture)` and `var(--completed)`.

Render:

- a left lifecycle rail with accessible hidden text
- a search input with Cmd+K hint
- ordered section headings with counts
- read-only note cards from the snapshot
- a disabled composer labeled “Add a note or prompt” until command mutations arrive in the next plan

Loading uses a labeled progress region. Repository error uses an alert with the exact error message.

- [ ] **Step 7: Add an Electron launch smoke test**

Launch `out/main/index.js` with Playwright’s `_electron.launch`, obtain the first window, and assert the title is `Kopper`, the search box is visible, and `window.process` is undefined in the renderer.

- [ ] **Step 8: Run all foundation verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit the launchable foundation**

```bash
git add components.json src/renderer tests/e2e package.json pnpm-lock.yaml tsconfig.web.json electron.vite.config.ts
 git commit -m "feat: add Oxide Ledger application shell"
```

## Milestone Acceptance

Run:

```bash
pnpm test && pnpm typecheck && pnpm build && pnpm test:e2e
```

The milestone passes when Kopper launches in a sandboxed renderer, creates or loads `kopper.json`, renders its validated sections and notes through typed IPC, and displays the semantic Oxide Ledger shell without exposing Node APIs.
