# Kopper Shadcn UI System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize every Kopper renderer surface on focused shadcn/Radix primitives, replace the Settings drawer with a full-panel Settings page, and prove that supported window sizes do not overflow.

**Architecture:** Keep product-specific feature components intact while making local shadcn primitives authoritative for common controls, overlays, feedback, and focus states. `DocumentPanel` owns a discriminated notes/settings route; each full-page surface owns exactly one intentional scroll area; Electron window and persistence authority remain unchanged.

**Tech Stack:** Electron 43, React 19, TypeScript 7, Tailwind CSS 4, `radix-ui` 1.6, class-variance-authority, Vitest, Testing Library, Playwright Electron

**Spec:** `docs/superpowers/specs/2026-08-17-kopper-shadcn-ui-system-design.md`

## Global Constraints

- Preserve Oxide Ledger semantic tokens, lifecycle spine, note cards, capture semantics, and original Kopper identity.
- Do not copy Copper branding, exact colors, typography, marketing copy, or behavior not demonstrated by the reference.
- Settings replaces the full panel page; do not create a drawer, sheet, split column, or Settings `BrowserWindow`.
- Preserve persistence-backed Pin/Unpin behavior; do not make the panel permanently always-on-top.
- Main panel support is exactly `380×640` default and `340×480` minimum.
- Expanded editor minimum remains exactly `420×480`.
- Keep `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.
- Do not add remote content, external fonts, accounts, telemetry, updates, arbitrary links, or widened preload APIs.
- Preserve repository-authoritative document and theme mutations; no visual success may precede acknowledgement.
- Use `const`, immutable transformations, guard clauses, natural TypeScript narrowing, and explicit conditionals.
- Do not add TypeScript assertions (`as`, angle-bracket casts, or non-null `!`) to production code.
- Effects synchronize external systems only; route changes and interaction decisions belong in event handlers.
- Use direct imports; do not create barrel files.
- Use TDD for every behavior change and run the stated red command before production edits.
- Keep one deliberate primary scroll owner per visible surface and forbid horizontal document overflow.
- Preserve keyboard access, focus restoration, VoiceOver semantics, reduced motion, and reduced transparency.
- Do not claim signing, notarization, Gatekeeper, or physical-mac evidence without observed protected results.

---

## File Structure

### New shared UI primitives

- `src/renderer/src/components/ui/label.tsx` — shadcn/Radix field label.
- `src/renderer/src/components/ui/radio-group.tsx` — shadcn/Radix exclusive radio choices.
- `src/renderer/src/components/ui/separator.tsx` — semantic horizontal or vertical rule.
- `src/renderer/src/components/ui/textarea.tsx` — shared multiline field states.
- `src/renderer/src/components/ui/toggle-group.tsx` — single-selection lifecycle control.
- `src/renderer/src/components/ui/tooltip.tsx` — provider, trigger, and bounded portal content.
- `src/renderer/src/components/ui/toast.tsx` — controlled toast root and viewport used by existing feedback providers.
- `src/renderer/src/components/ui/ui-primitives.test.tsx` — accessible behavior contract for the new primitives.

### New Settings page modules

- `src/renderer/src/features/settings/settingsRoute.ts` — `SettingsTab`, `PanelRoute`, guards, and route builders.
- `src/renderer/src/features/settings/SettingsPage.tsx` — full-panel header, Back action, tabs, and one scroll owner.
- `src/renderer/src/features/settings/SettingsPage.test.tsx` — tab selection, Back, Escape ownership, and containment semantics.

### Existing modules with narrowed responsibilities

- `src/renderer/src/app/DocumentPanel.tsx` — owns panel route and focus restoration as well as existing notes-page state.
- `src/renderer/src/features/panel/PanelHeader.tsx` — receives search and menu refs; renders notes-page controls only.
- `src/renderer/src/features/panel/PanelMenu.tsx` — dropdown actions only; requests Settings navigation instead of owning it.
- `src/renderer/src/features/panel/PanelSettingsSheet.tsx` — delete after Settings page migration.
- `src/renderer/src/components/ui/sheet.tsx` — delete when no consumer remains.
- `src/renderer/src/features/settings/{ShortcutSettings,AppearanceSettings,DataSettings,ThemeEditor,ThemeImportDialog}.tsx` — consume shared controls and use narrow-width-safe settings rows.
- `src/renderer/src/features/{notes,editor,sections,panel,feedback,capture,onboarding,recovery}/**/*.tsx` — consume primitives while retaining feature semantics.
- `src/renderer/src/components/ui/{dialog,alert-dialog,dropdown-menu,context-menu,select,scroll-area}.tsx` — viewport containment and common focus geometry.
- `src/renderer/src/styles/globals.css` — route-level overflow ownership and restrained page transition.
- `src/renderer/src/main.tsx` — mark capture-HUD versus content renderer surface without changing privileges.

### Evidence

- `tests/e2e/helpers/surfaceGeometry.ts` — reusable geometry assertions for document and explicit scroll owners.
- `tests/e2e/demo-parity.spec.ts` — notes/settings round trip and deterministic Settings screenshots.
- `tests/e2e/{document-workflows,recovery,theme-workflows,security}.spec.ts` — route-specific overflow and keyboard checks.
- `tests/e2e/demo-parity.spec.ts-snapshots/*` — Light/Dark Settings baselines at default and minimum sizes.
- `docs/releases/demo-parity-automated-evidence.md` and `docs/releases/v0.1.0-acceptance.md` — exact-source automated evidence after the final source commit.

---

### Task 1: Establish the shadcn Primitive and Overlay Contract

**Files:**

- Create: `src/renderer/src/components/ui/label.tsx`
- Create: `src/renderer/src/components/ui/radio-group.tsx`
- Create: `src/renderer/src/components/ui/separator.tsx`
- Create: `src/renderer/src/components/ui/textarea.tsx`
- Create: `src/renderer/src/components/ui/toggle-group.tsx`
- Create: `src/renderer/src/components/ui/tooltip.tsx`
- Create: `src/renderer/src/components/ui/toast.tsx`
- Create: `src/renderer/src/components/ui/ui-primitives.test.tsx`
- Modify: `src/renderer/src/components/ui/dialog.tsx`
- Modify: `src/renderer/src/components/ui/alert-dialog.tsx`
- Modify: `src/renderer/src/components/ui/dropdown-menu.tsx`
- Modify: `src/renderer/src/components/ui/context-menu.tsx`
- Modify: `src/renderer/src/components/ui/select.tsx`
- Modify: `src/renderer/src/components/ui/scroll-area.tsx`

**Interfaces:**

- Produces: `Label(props: React.ComponentProps<typeof LabelPrimitive.Root>)`.
- Produces: `RadioGroup`, `RadioGroupItem` with Radix `value` and `onValueChange` semantics.
- Produces: `Separator(props)` with decorative default and semantic opt-in through Radix props.
- Produces: `Textarea(props: React.ComponentProps<"textarea">)` with `data-slot="textarea"`.
- Produces: `ToggleGroup`, `ToggleGroupItem` with Radix single/multiple root semantics.
- Produces: `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`.
- Produces: `ToastProvider`, `Toast`, `ToastTitle`, `ToastDescription`, `ToastViewport`.
- Produces: bounded overlay content whose maximum width is `calc(100vw - 2rem)` and maximum height is `calc(100dvh - 2rem)`.
- Consumes: existing `cn` helper and semantic Tailwind theme tokens only.

- [ ] **Step 1: Write failing primitive behavior tests**

Create `ui-primitives.test.tsx` with focused tests that prove real accessibility behavior:

```tsx
function ToggleHarness() {
  const [value, setValue] = useState("active");
  return (
    <ToggleGroup type="single" value={value} onValueChange={(next) => {
      if (next.length > 0) setValue(next);
    }} aria-label="Note lifecycle view">
      <ToggleGroupItem value="active">Active</ToggleGroupItem>
      <ToggleGroupItem value="completed">Completed</ToggleGroupItem>
    </ToggleGroup>
  );
}

it("exposes a single selected lifecycle value", async () => {
  const user = userEvent.setup();
  render(<ToggleHarness />);
  await user.click(screen.getByRole("button", { name: "Completed" }));
  expect(screen.getByRole("button", { name: "Completed" })).toHaveAttribute("data-state", "on");
});

it("associates labels and invalid multiline fields", () => {
  render(<><Label htmlFor="body">Body</Label><Textarea id="body" aria-invalid="true" /></>);
  expect(screen.getByRole("textbox", { name: "Body" })).toHaveAttribute("data-slot", "textarea");
  expect(screen.getByRole("textbox", { name: "Body" })).toHaveAttribute("aria-invalid", "true");
});
```

Also cover radio selection, tooltip trigger naming, toast status/error semantics, and a `ScrollArea` viewport with no horizontal scrollbar rendered by default.

- [ ] **Step 2: Run the primitive tests and verify RED**

Run:

```bash
pnpm vitest run src/renderer/src/components/ui/ui-primitives.test.tsx
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Implement the primitive files from the installed Radix namespaces**

Use direct namespace imports from `radix-ui`. Keep each file focused. The multiline field contract is:

```tsx
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full min-w-0 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}
```

Use the existing `Button`/`Input` geometry as the visual source. Do not add a second token system.

- [ ] **Step 4: Bound all shared portal surfaces**

Update dialog, alert dialog, menu, context menu, select, tooltip, and toast portal content so long content cannot escape the viewport. Dialog and alert-dialog content must use a bounded flex/grid layout; scrolling belongs to an explicit child rather than the body. Menus must use Radix collision handling and a viewport-aware maximum width.

Add `orientation="vertical"` by default in `ScrollBar` and render a horizontal scrollbar only when a caller explicitly includes `<ScrollBar orientation="horizontal" />`.

- [ ] **Step 5: Run primitive and existing overlay tests**

Run:

```bash
pnpm vitest run \
  src/renderer/src/components/ui/ui-primitives.test.tsx \
  src/renderer/src/features/notes/NoteContextMenu.test.tsx \
  src/renderer/src/features/settings/ThemeImportDialog.test.tsx \
  src/renderer/src/features/recovery/RecoveryScreen.test.tsx
pnpm typecheck
```

Expected: all selected tests PASS and typecheck exits 0.

- [ ] **Step 6: Commit the primitive contract**

```bash
git add src/renderer/src/components/ui
git commit -m "feat: establish shadcn surface primitives"
```

---

### Task 2: Replace the Settings Sheet with Panel Routing

**Files:**

- Create: `src/renderer/src/features/settings/settingsRoute.ts`
- Create: `src/renderer/src/features/settings/SettingsPage.tsx`
- Create: `src/renderer/src/features/settings/SettingsPage.test.tsx`
- Modify: `src/renderer/src/app/DocumentPanel.tsx`
- Modify: `src/renderer/src/app/App.test.tsx`
- Modify: `src/renderer/src/features/panel/PanelHeader.tsx`
- Modify: `src/renderer/src/features/panel/PanelMenu.tsx`
- Modify: `src/renderer/src/features/panel/PanelShortcuts.tsx`
- Modify: `src/renderer/src/features/panel/PanelShortcuts.test.tsx`
- Delete: `src/renderer/src/features/panel/PanelSettingsSheet.tsx`
- Delete: `src/renderer/src/components/ui/sheet.tsx`

**Interfaces:**

- Produces: `type SettingsTab = "shortcuts" | "appearance" | "data"`.
- Produces: `type PanelRoute = { page: "notes" } | { page: "settings"; tab: SettingsTab; returnFocus: "menu" | "search" }`.
- Produces: `isSettingsTab(value: string): value is SettingsTab` without assertions.
- Produces: `SettingsPage({ activeTab, captureUnavailable, changeTab, closeSettings })`.
- Changes: `PanelMenu` receives `openSettings(tab: SettingsTab): void` and `triggerRef: Ref<HTMLButtonElement>`.
- Changes: `PanelHeader` receives `searchInputRef` and `menuTriggerRef` from `DocumentPanel`.
- Changes: `PanelShortcuts` receives `enabled: boolean` and ignores note-page shortcuts while Settings is visible.
- Consumes: existing `window.kopper.onOpenSettings()` event; no new IPC channel.

- [ ] **Step 1: Replace the sheet expectation with failing full-page route tests**

In `App.test.tsx`, replace the controlled-sheet test with:

```tsx
it("replaces notes with Appearance settings and restores menu focus on Back", async () => {
  const user = userEvent.setup();
  render(<App />);
  const trigger = screen.getByRole("button", { name: "Panel menu" });
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Settings…" }));

  expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Appearance" })).toHaveAttribute("data-state", "active");
  expect(screen.queryByRole("searchbox", { name: "Search notes" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Back to notes" }));
  expect(screen.getByRole("searchbox", { name: "Search notes" })).toBeVisible();
  expect(trigger).toHaveFocus();
});
```

Add a second test that captures the registered `onOpenSettings` listener, invokes it, expects Shortcuts active, returns with Escape, and expects Search notes focused. Add a third test that proves a search query and Completed view survive a Settings round trip.

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
pnpm vitest run src/renderer/src/app/App.test.tsx
```

Expected: FAIL because Settings is still a dialog/sheet and notes remain mounted behind it.

- [ ] **Step 3: Define the route types and guard**

Create `settingsRoute.ts`:

```ts
export type SettingsTab = "shortcuts" | "appearance" | "data";
export type PanelRoute =
  | { page: "notes" }
  | {
      page: "settings";
      tab: SettingsTab;
      returnFocus: "menu" | "search";
    };

export function isSettingsTab(value: string): value is SettingsTab {
  return value === "shortcuts" || value === "appearance" || value === "data";
}
```

- [ ] **Step 4: Build the full-panel `SettingsPage`**

Use `PanelShell` only in `DocumentPanel`; `SettingsPage` renders the page contents inside it. Its shape is:

```tsx
interface SettingsPageProps {
  activeTab: SettingsTab;
  captureUnavailable: boolean;
  changeTab(tab: SettingsTab): void;
  closeSettings(): void;
}
```

Render a fixed header with shadcn Back button, `h1` “Settings,” horizontal `TabsList`, and one `ScrollArea data-scroll-owner="settings"` containing the active settings component. `onValueChange` must call `isSettingsTab` before `changeTab`.

Handle Escape in a route-level key listener only when the active element is not an input, textarea, select, contenteditable, menu, or dialog owner.

- [ ] **Step 5: Lift navigation and focus refs into `DocumentPanel`**

Keep `query`, lifecycle `view`, capture highlight, search ref, and menu ref in `DocumentPanel`. Add route state initialized to `{ page: "notes" }`.

Keep the notes subtree mounted inside a container whose `hidden` attribute is true while Settings is visible. This visually and accessibly replaces notes while preserving `NoteCollection` selection and the composer's latest local draft during the route round trip. Render `SettingsPage` only for the settings route. `PanelShortcuts enabled={route.page === "notes"}` prevents Cmd+K from focusing hidden Search. Do not duplicate either page or render two visible scroll owners.

Menu entry sets:

```ts
setRoute({ page: "settings", tab: "appearance", returnFocus: "menu" });
```

Native event sets:

```ts
setRoute({ page: "settings", tab: "shortcuts", returnFocus: "search" });
```

Closing Settings sets the notes route and records the return target. A narrow layout effect may focus the now-mounted ref because focus is an external DOM system; interaction decisions remain in handlers.

Continue rendering `CaptureToast displayNotice={false}` outside the route so capture highlighting receives authoritative outcomes while Settings is visible.

- [ ] **Step 6: Remove sheet ownership from `PanelMenu`**

Remove `settingsOpen`, `settingsTab`, the `onOpenSettings` effect, and `PanelSettingsSheet`. Keep pin, undo, add-section, status copy, and dropdown focus behavior. Pass the trigger ref from its owner rather than creating it internally.

Delete `PanelSettingsSheet.tsx` and delete `sheet.tsx` after confirming no imports remain:

```bash
rg -n 'PanelSettingsSheet|components/ui/sheet' src/renderer/src
```

Expected: no matches.

- [ ] **Step 7: Run route and panel tests**

Run:

```bash
pnpm vitest run \
  src/renderer/src/app/App.test.tsx \
  src/renderer/src/features/settings/SettingsPage.test.tsx \
  src/renderer/src/features/panel/PanelShortcuts.test.tsx
pnpm typecheck
```

Expected: all selected tests PASS; settings route tests prove focus and state restoration.

- [ ] **Step 8: Commit full-panel Settings navigation**

```bash
git add src/renderer/src/app src/renderer/src/features/panel src/renderer/src/features/settings src/renderer/src/components/ui
git commit -m "feat: replace settings drawer with panel page"
```

---

### Task 3: Make Settings Forms Narrow-width Safe

**Files:**

- Modify: `src/renderer/src/features/settings/SettingsPage.tsx`
- Modify: `src/renderer/src/features/settings/ShortcutSettings.tsx`
- Modify: `src/renderer/src/features/settings/ShortcutSettings.test.tsx`
- Modify: `src/renderer/src/features/settings/AppearanceSettings.tsx`
- Modify: `src/renderer/src/features/settings/AppearanceSettings.test.tsx`
- Modify: `src/renderer/src/features/settings/DataSettings.tsx`
- Modify: `src/renderer/src/features/settings/DataSettings.test.tsx`
- Modify: `src/renderer/src/features/settings/ThemeEditor.tsx`
- Modify: `src/renderer/src/features/settings/ThemeEditor.test.tsx`
- Modify: `src/renderer/src/features/settings/ThemeImportDialog.tsx`
- Modify: `src/renderer/src/features/settings/ThemeImportDialog.test.tsx`

**Interfaces:**

- Consumes: Task 1 primitives and Task 2 `SettingsPage`.
- Produces: settings sections that fit a 308px content column without fixed-width action clusters.
- Produces: `parseAppearanceMode(value: string): AppearanceMode | null` or equivalent natural-narrowing guard; no cast from Select value.
- Produces: one action dropdown per theme row for Customize/Edit, Export, and Delete.

- [ ] **Step 1: Add failing settings interaction and long-content tests**

Add tests for:

1. Shortcut choice uses a named radio group and recording remains cancellable with Escape.
2. Appearance mode ignores an unknown Select value instead of asserting it.
3. A long theme name has one bounded action menu rather than four adjacent buttons.
4. Every theme token text field has an associated `Label`, and each optional native color picker has a token-specific accessible name.
5. Data action labels remain available when actions wrap.
6. Long import file names and contrast failures remain complete in accessible text.

Example appearance assertion:

```tsx
expect(screen.getByRole("button", { name: "Actions for A very long custom theme name" })).toBeVisible();
expect(screen.queryByRole("button", { name: /Export A very long/ })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run settings tests and verify RED**

Run:

```bash
pnpm vitest run \
  src/renderer/src/features/settings/ShortcutSettings.test.tsx \
  src/renderer/src/features/settings/AppearanceSettings.test.tsx \
  src/renderer/src/features/settings/DataSettings.test.tsx \
  src/renderer/src/features/settings/ThemeEditor.test.tsx \
  src/renderer/src/features/settings/ThemeImportDialog.test.tsx
```

Expected: FAIL on raw radio semantics, fixed action cluster, and unguarded Select handling.

- [ ] **Step 3: Normalize settings section structure**

Use shared `Label`, `Separator`, `Input`, `RadioGroup`, `Select`, `Button`, and `DropdownMenu` primitives. Keep settings sections flat: heading/description, separated setting rows, and wrapping action rows. Do not introduce generic `SettingsRow` wrappers unless at least three sections need exactly the same props and semantics.

Use `min-w-0`, `w-full`, `flex-wrap`, and `break-words` deliberately. Remove `min-w-40` behavior from settings Select triggers through caller classes or the shared Select contract.

- [ ] **Step 4: Collapse theme actions into one contextual menu**

Each theme row renders:

- a shrinking name/ID column;
- one explicit Activate/Active control; and
- one icon/text action-menu trigger with an accessible theme-specific name.

The menu contains Customize/Edit, Export, and Delete only when applicable. Delete retains its existing `AlertDialog` and persistence-first behavior.

- [ ] **Step 5: Make Theme Editor responsive without hiding validation**

Change each token row from a fixed `w-40` action cluster to a responsive grid:

```tsx
const fieldId = `${mode}-${token}`;
return (
  <div className="grid min-w-0 gap-1.5 py-2">
    <Label htmlFor={fieldId}>{token}</Label>
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5">
      {hex === null ? null : (
        <Input
          type="color"
          value={hex}
          aria-label={`${token} color picker`}
          disabled={saving}
          onChange={(event) => updateToken(token, event.currentTarget.value)}
          className="size-8 p-1"
        />
      )}
      <Input
        id={fieldId}
        value={value}
        aria-invalid={problem !== undefined}
        disabled={saving}
        onChange={(event) => updateToken(token, event.currentTarget.value)}
        className="min-w-0 font-mono text-[11px]"
      />
      <Button type="button" size="xs" variant="ghost" onClick={() => resetToken(token)}>
        Reset
      </Button>
    </div>
    {problem === undefined ? null : <p role="alert">{problem}</p>}
  </div>
);
```

The dialog uses one explicit `ScrollArea`; sticky token-group headings stay within that viewport. Keep exact 4.5:1 validation, opaque-root validation, live preview, retry behavior, and discard confirmation unchanged.

- [ ] **Step 6: Run all settings tests and typecheck**

Run:

```bash
pnpm vitest run src/renderer/src/features/settings
pnpm typecheck
```

Expected: all settings tests PASS and no TypeScript diagnostics.

- [ ] **Step 7: Commit responsive Settings forms**

```bash
git add src/renderer/src/features/settings
git commit -m "feat: standardize responsive settings controls"
```

---

### Task 4: Standardize Main-panel Controls and Editing

**Files:**

- Modify: `src/renderer/src/features/panel/PanelHeader.tsx`
- Modify: `src/renderer/src/features/search/SearchField.tsx`
- Modify: `src/renderer/src/features/notes/NoteComposer.tsx`
- Modify: `src/renderer/src/features/notes/NoteComposer.test.tsx`
- Modify: `src/renderer/src/features/editor/MarkdownEditor.tsx`
- Modify: `src/renderer/src/features/editor/MarkdownEditor.test.tsx`
- Modify: `src/renderer/src/features/notes/NoteCard.tsx`
- Modify: `src/renderer/src/features/notes/NoteCard.test.tsx`
- Modify: `src/renderer/src/features/sections/SectionGroup.tsx`
- Modify: `src/renderer/src/features/sections/SectionGroup.test.tsx`
- Modify: `src/renderer/src/features/sections/SectionManager.tsx`
- Modify: `src/renderer/src/features/sections/SectionManager.test.tsx`
- Modify: `src/renderer/src/features/sections/AddSectionDialog.tsx`

**Interfaces:**

- Consumes: shared `Textarea`, `Label`, `ToggleGroup`, `Tooltip`, `Select`, `Button`, and `AlertDialog`.
- Preserves: `NoteComposer` authoritative submit/clear behavior and `Cmd+Enter`.
- Preserves: note card keyboard intent, selection semantics, lifecycle presentation, and product-specific circular status control.
- Replaces: `globalThis.confirm` with controlled discard `AlertDialog`.

- [ ] **Step 1: Add failing user-behavior tests**

Add or revise tests to require:

- Active/Completed is a single-selection group with both accessible labels and selected state.
- Composer uses the shared multiline field while retaining focus after acknowledged submit.
- Markdown Escape with dirty content opens “Discard your unsaved changes?” and does not close until “Discard changes” is chosen.
- Markdown Escape with unchanged content closes without confirmation.
- Note lifecycle control remains circular, named, and keyboard operable.
- Section activation and management use shared buttons without changing heading semantics.
- Referenced-section deletion uses shared Select and cannot submit without a destination.

Example discard test:

```tsx
await user.clear(screen.getByRole("textbox", { name: "Edit note" }));
await user.type(screen.getByRole("textbox", { name: "Edit note" }), "Changed");
await user.keyboard("{Escape}");
expect(screen.getByRole("alertdialog", { name: "Discard your unsaved changes?" })).toBeVisible();
expect(onEditingChange).not.toHaveBeenCalledWith(false);
await user.click(screen.getByRole("button", { name: "Discard changes" }));
expect(onEditingChange).toHaveBeenCalledWith(false);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm vitest run \
  src/renderer/src/app/App.test.tsx \
  src/renderer/src/features/notes/NoteComposer.test.tsx \
  src/renderer/src/features/editor/MarkdownEditor.test.tsx \
  src/renderer/src/features/notes/NoteCard.test.tsx \
  src/renderer/src/features/sections/SectionGroup.test.tsx \
  src/renderer/src/features/sections/SectionManager.test.tsx
```

Expected: FAIL on toggle semantics, native confirm behavior, and raw Select/button controls.

- [ ] **Step 3: Convert generic controls while preserving feature composition**

Use `ToggleGroup type="single"` for lifecycle view. Guard an empty Radix value so one view always remains selected. Keep visible labels “Active” and “Completed.”

Use `Textarea` in composer and editor. Preserve composer custom border, lifecycle marker, layout, and `data-composer-surface`; do not wrap it in a generic card.

Use `Label` in add/rename dialogs. Use shared `Select` for destination section. Use `Button` with narrowly overridden geometry for section headings and circular note lifecycle actions.

- [ ] **Step 4: Implement persistence-safe editor discard dialog**

Replace native confirm with local `discardOpen` state and `AlertDialog`. Escape requests discard; it never discards immediately when dirty. Saving state disables closing and destructive actions consistently. Do not clear the draft until discard is explicitly acknowledged.

- [ ] **Step 5: Add tooltips only where visual labels are absent**

Wrap panel overflow, section management, note lifecycle, and other icon-only controls in shared Tooltip. Keep `aria-label` on the actual control. Do not add tooltips to buttons that already contain complete visible text.

- [ ] **Step 6: Run main-panel tests and typecheck**

Run:

```bash
pnpm vitest run \
  src/renderer/src/app/App.test.tsx \
  src/renderer/src/features/notes \
  src/renderer/src/features/editor \
  src/renderer/src/features/sections \
  src/renderer/src/features/search
pnpm typecheck
```

Expected: all selected tests PASS; no behavior changes to command payloads.

- [ ] **Step 7: Commit main-panel control consistency**

```bash
git add src/renderer/src/features/panel src/renderer/src/features/search src/renderer/src/features/notes src/renderer/src/features/editor src/renderer/src/features/sections
git commit -m "feat: standardize panel interaction controls"
```

---

### Task 5: Unify Feedback and Forbid Capture-HUD Scrolling

**Files:**

- Modify: `src/renderer/src/features/feedback/PanelFeedback.tsx`
- Modify: `src/renderer/src/features/feedback/PanelFeedback.test.tsx`
- Modify: `src/renderer/src/features/panel/PanelMenu.tsx`
- Modify: `src/renderer/src/app/App.test.tsx`
- Modify: `src/renderer/src/features/capture/CaptureToast.tsx`
- Modify: `src/renderer/src/features/capture/CaptureToast.test.tsx`
- Create: `src/renderer/src/rendererSurface.ts`
- Create: `src/renderer/src/rendererSurface.test.ts`
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/src/styles/globals.css`
- Test: `src/main/window/windowManager.test.ts`

**Interfaces:**

- Changes: `PanelFeedbackValue` adds `reportNotice(message: string, tone?: "status" | "error"): void`.
- Consumes: Task 1 controlled toast primitives.
- Produces: one `ToastViewport` per renderer feedback provider.
- Produces: `rendererSurface(hash: string): "capture-hud" | "content"` and `html[data-renderer-surface="capture-hud"]` for route-scoped no-overflow CSS.
- Preserves: detached HUD timing, click-through/focus behavior, authoritative card highlight, and the existing 340×72 HUD bounds.

- [ ] **Step 1: Add failing feedback and HUD tests**

Require:

- clipboard success appears as a polite visible toast with “Copied note.” or “Copied N notes.”;
- clipboard failure uses alert semantics;
- a second notice replaces and resets the one timer;
- pin success and failure use the shared reporter instead of a separate hidden paragraph;
- `rendererSurface("#capture-hud")` returns `"capture-hud"` while editor and normal hashes return `"content"`;
- capture HUD status remains nonfocusable;
- window manager still anchors/repositions the 340×72 HUD to panel bounds.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm vitest run \
  src/renderer/src/features/feedback/PanelFeedback.test.tsx \
  src/renderer/src/features/capture/CaptureToast.test.tsx \
  src/renderer/src/rendererSurface.test.ts \
  src/renderer/src/app/App.test.tsx \
  src/main/window/windowManager.test.ts
```

Expected: FAIL because success is screen-reader-only, pin feedback is local, and the renderer root has no surface marker.

- [ ] **Step 3: Render shared controlled toast feedback**

Keep `PanelFeedbackProvider` as the deep feature interface. Internally render Task 1 toast primitives. Continue one replaceable 1,800ms timer. `reportClipboardResult` delegates to `reportNotice`; `PanelMenu` delegates pin results to the provider.

Do not move settings validation failures into transient toasts. Errors needed to correct a field remain inline beside that field.

- [ ] **Step 4: Mark renderer surface and lock HUD overflow**

Create a naturally narrowed surface classifier:

```ts
export type RendererSurface = "capture-hud" | "content";

export function rendererSurface(hash: string): RendererSurface {
  return hash === "#capture-hud" ? "capture-hud" : "content";
}
```

Before `createRoot`, use it for both routing and the one root data attribute:

```ts
const surface = rendererSurface(globalThis.location.hash);
const captureHud = surface === "capture-hud";
document.documentElement.dataset.rendererSurface = surface;
```

Add route-scoped CSS:

```css
html[data-renderer-surface="capture-hud"],
html[data-renderer-surface="capture-hud"] body,
html[data-renderer-surface="capture-hud"] #root {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
```

Keep the main content body's 340px contract unchanged.

- [ ] **Step 5: Verify feedback and security-sensitive HUD behavior**

Run:

```bash
pnpm vitest run \
  src/renderer/src/features/feedback/PanelFeedback.test.tsx \
  src/renderer/src/features/capture/CaptureToast.test.tsx \
  src/renderer/src/rendererSurface.test.ts \
  src/main/window/windowManager.test.ts \
  src/main/security/securityPolicy.test.ts
pnpm typecheck
```

Expected: all selected tests PASS and HUD security options remain unchanged.

- [ ] **Step 6: Commit feedback and HUD containment**

```bash
git add src/renderer/src/features/feedback src/renderer/src/features/capture src/renderer/src/features/panel/PanelMenu.tsx src/renderer/src/rendererSurface.ts src/renderer/src/rendererSurface.test.ts src/renderer/src/main.tsx src/renderer/src/styles/globals.css src/main/window/windowManager.test.ts
git commit -m "feat: unify panel feedback surfaces"
```

---

### Task 6: Contain Secondary Renderer Surfaces

**Files:**

- Modify: `src/renderer/src/features/editor/ExpandedEditorWindow.tsx`
- Modify: `src/renderer/src/features/editor/MarkdownEditor.tsx`
- Modify: `src/renderer/src/features/onboarding/AccessibilityOnboarding.tsx`
- Modify: `src/renderer/src/features/onboarding/AccessibilityOnboarding.test.tsx`
- Modify: `src/renderer/src/features/recovery/RecoveryScreen.tsx`
- Modify: `src/renderer/src/features/recovery/RecoveryScreen.test.tsx`
- Modify: `src/renderer/src/app/DocumentPanel.tsx`
- Modify: `src/renderer/src/features/panel/PanelShell.tsx`
- Modify: `src/renderer/src/styles/globals.css`

**Interfaces:**

- Produces: `data-scroll-owner="editor"`, `"onboarding"`, `"recovery"`, `"notes"`, or `"settings"` on the one primary scroll viewport per surface.
- Consumes: shared `ScrollArea`, `Button`, and updated dialog primitives.
- Preserves: onboarding permission lifecycle, recovery byte preservation, explicit destructive confirmation, and expanded-editor deduplication.

- [ ] **Step 1: Add failing containment semantics tests**

Add component assertions that:

- onboarding action groups can wrap/stack and expose one scroll owner;
- recovery long paths remain complete and use one scroll owner;
- expanded editor has a fixed header and one editor scroll owner;
- notes and Settings never expose two visible primary scroll owners simultaneously;
- loading and error states stay inside `PanelShell`.

These tests assert `data-scroll-owner` and accessible content, while Playwright in Task 7 proves pixel geometry.

- [ ] **Step 2: Run secondary-surface tests and verify RED**

Run:

```bash
pnpm vitest run \
  src/renderer/src/features/onboarding/AccessibilityOnboarding.test.tsx \
  src/renderer/src/features/recovery/RecoveryScreen.test.tsx \
  src/renderer/src/features/editor/MarkdownEditor.test.tsx \
  src/renderer/src/app/App.test.tsx
```

Expected: FAIL because scroll ownership is implicit and onboarding uses a fixed two-column action row.

- [ ] **Step 3: Establish one explicit scroll owner per surface**

Use `h-dvh`, `min-h-0`, `min-w-0`, and `overflow-hidden` on page shells. Place content inside exactly one shared `ScrollArea` marked with its owner. Keep fixed headers and footer actions outside that viewport.

At 340px, onboarding actions stack vertically. At 420px expanded-editor minimum, header controls wrap without widening the document. Recovery paths use `break-all`; recovery action labels remain complete.

- [ ] **Step 4: Audit state and error copy while touching each surface**

Keep active voice and operation-specific copy. Preserve existing roles: blocking failure is `alert`, nonurgent progress/result is polite `status`. Do not change persistence or permission APIs.

- [ ] **Step 5: Run all renderer component tests**

Run:

```bash
pnpm vitest run src/renderer/src
pnpm typecheck
```

Expected: all renderer tests PASS with no TypeScript diagnostics.

- [ ] **Step 6: Commit secondary-surface containment**

```bash
git add src/renderer/src/app src/renderer/src/features/editor src/renderer/src/features/onboarding src/renderer/src/features/recovery src/renderer/src/features/panel/PanelShell.tsx src/renderer/src/styles/globals.css
git commit -m "fix: contain secondary renderer surfaces"
```

---

### Task 7: Add Deterministic Overflow and Visual Evidence

**Files:**

- Create: `tests/e2e/helpers/surfaceGeometry.ts`
- Modify: `tests/e2e/demo-parity.spec.ts`
- Modify: `tests/e2e/document-workflows.spec.ts`
- Modify: `tests/e2e/recovery.spec.ts`
- Modify: `tests/e2e/theme-workflows.spec.ts`
- Modify: `tests/e2e/security.spec.ts`
- Modify: `tests/e2e/launch.spec.ts`
- Create: `tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-settings-light-380x640-darwin.png`
- Create: `tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-settings-light-340x480-darwin.png`
- Create: `tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-settings-dark-380x640-darwin.png`
- Create: `tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-settings-dark-340x480-darwin.png`
- Update intentionally changed existing snapshots in the same directory.

**Interfaces:**

- Produces: `expectSurfaceContained(page: Page, expectedOwner: string): Promise<void>`.
- Produces: `setSurfaceSize(page: Page, width: number, height: number): Promise<void>` or combines sizing with containment.
- Consumes: `data-scroll-owner` contracts from Tasks 2 and 6.

- [ ] **Step 1: Write the geometry helper and failing Settings journey**

The helper must inspect real layout:

```ts
export async function expectSurfaceContained(
  page: Page,
  expectedOwner: string,
): Promise<void> {
  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const owners = Array.from(
      document.querySelectorAll<HTMLElement>("[data-scroll-owner]"),
    ).filter((owner) => owner.getClientRects().length > 0);
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      owners: owners.map((owner) => owner.dataset.scrollOwner ?? ""),
      rightEdges: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => element.getBoundingClientRect().right),
    };
  });

  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.scrollHeight).toBe(geometry.clientHeight);
  expect(geometry.owners).toEqual([expectedOwner]);
  expect(Math.max(...geometry.rightEdges)).toBeLessThanOrEqual(
    geometry.clientWidth + 0.5,
  );
}
```

Exclude Radix offscreen accessibility sentinels from edge calculations by a semantic selector rather than increasing the tolerance.

Add a demo-parity test that opens Settings, verifies Appearance is initial, visits all tabs by keyboard, returns to notes, and proves the original query/view state remains.

- [ ] **Step 2: Run the new journey and verify RED**

Run:

```bash
pnpm build
pnpm exec playwright test tests/e2e/demo-parity.spec.ts --grep "Settings"
```

Expected: FAIL before the new full-panel geometry/snapshots are accepted or if any migrated surface overflows.

- [ ] **Step 3: Apply containment checks to every E2E surface**

At both 380×640 and 340×480, check notes and Settings. At 420×480, check expanded editor. Add checks to onboarding/recovery/theme dialogs at the smallest owning viewport reached by their existing journeys. Assert menus/dialogs with `toBeInViewport()` and bounding boxes rather than screenshots alone.

The security journey must continue asserting sandbox, context isolation, blocked navigation, and CSP after the UI changes.

- [ ] **Step 4: Capture deterministic Settings baselines**

Use the existing deterministic `demoDocument`, exact Oxide Ledger Light/Dark modes, disabled animations, and hidden caret. Capture Appearance Settings at both sizes with no open menu, focused field, or transient toast.

Generate expected images:

```bash
pnpm exec playwright test tests/e2e/demo-parity.spec.ts --update-snapshots
```

Inspect each image at full resolution. Reject clipped tabs, horizontal scrollbars, overlapping footer/header surfaces, unreadable truncation, and generic card-grid styling.

- [ ] **Step 5: Run the complete E2E suite twice for stability**

Run:

```bash
pnpm test:e2e
pnpm test:e2e
MATCHES=$(pgrep -ifl 'Electron|Kopper' | grep 'kopper-e2e-' | grep -vE 'grep |pgrep ' || true)
test -z "$MATCHES"
MATCHES=$(find "${TMPDIR:-/tmp}" -maxdepth 1 -type d -name 'kopper-e2e-*' -print)
test -z "$MATCHES"
```

Expected: both runs PASS, all screenshot comparisons PASS, and both cleanup assertions exit 0.

- [ ] **Step 6: Commit regression evidence**

```bash
git add tests/e2e
git commit -m "test: enforce renderer overflow contract"
```

---

### Task 8: Review the Whole UI-system Range and Fix Findings

**Files:**

- Modify only files implicated by verified review findings.
- Create: `.superpowers/sdd/2026-08-17-kopper-shadcn-ui-system/final-review.md`
- Create: `.superpowers/sdd/2026-08-17-kopper-shadcn-ui-system/final-fix-report.md` if fixes are required.

**Interfaces:**

- Consumes: all Task 1–7 behavior and the approved specification.
- Produces: one reviewed final production-source commit before evidence documents are updated.

- [ ] **Step 1: Record the review range**

```bash
BASE_SHA=09057d8
HEAD_SHA=$(git rev-parse HEAD)
printf 'BASE=%s\nHEAD=%s\n' "$BASE_SHA" "$HEAD_SHA"
```

Review the entire diff, not only the final task.

- [ ] **Step 2: Review against the specification line by line**

Inspect:

- raw interactive controls remaining outside `components/ui`;
- any TypeScript assertions added in production;
- route ownership and focus restoration;
- one-scroll-owner geometry;
- fixed widths/minimum widths;
- portal containment;
- theme token usage versus hard-coded colors;
- authoritative persistence and capture behavior;
- listener/timer cleanup;
- keyboard and VoiceOver semantics;
- reduced motion/transparency;
- security boundaries; and
- unused Sheet code/imports.

Use semantic searches where available and scoped text searches otherwise:

```bash
rg -n '<(button|input|textarea|select)\b' src/renderer/src --glob '!components/ui/**'
rg -n '\sas\s|\w!([.;,)\]])' src/renderer/src src/main
rg -n 'overflow-(x|y|auto|scroll)|min-w-|w-\[[^]]+\]' src/renderer/src
rg -n 'PanelSettingsSheet|components/ui/sheet|globalThis\.confirm' src/renderer/src
```

Every remaining raw control must have a written product-specific reason in the review report.

- [ ] **Step 3: Run focused checks before judging readiness**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm audit:source
git diff --check "$BASE_SHA"..HEAD
```

Record exact counts and failures in `final-review.md`.

- [ ] **Step 4: Fix Critical and Important findings with TDD**

For each verified finding: add a failing test, observe RED, implement the smallest fix, observe GREEN, and record the test command in `final-fix-report.md`. Do not batch unrelated cleanup.

- [ ] **Step 5: Commit the reviewed final source**

If no fixes were required, the Task 7 commit is the final source. If fixes were required:

```bash
git add src tests package.json pnpm-lock.yaml electron-builder.yml electron.vite.config.ts
git diff --cached --name-only
git commit -m "fix: close shadcn UI review findings"
```

Capture exact source identity before evidence-only edits:

```bash
TESTED_SOURCE=$(git rev-parse HEAD)
TESTED_TREE=$(git rev-parse HEAD^{tree})
printf 'TESTED_SOURCE=%s\nTESTED_TREE=%s\n' "$TESTED_SOURCE" "$TESTED_TREE"
```

- [ ] **Step 6: Commit internal review records**

The `.superpowers/sdd` directory is intentionally ignored. Force-add only the scoped records if repository convention requires them:

```bash
git add -f .superpowers/sdd/2026-08-17-kopper-shadcn-ui-system/final-review.md
if test -f .superpowers/sdd/2026-08-17-kopper-shadcn-ui-system/final-fix-report.md; then
  git add -f .superpowers/sdd/2026-08-17-kopper-shadcn-ui-system/final-fix-report.md
fi
git commit -m "docs: record shadcn UI system review"
```

The review-record commit changes no production/package source and is not the tested source SHA.

---

### Task 9: Run the Exact-source Gate and Refresh Honest Evidence

**Files:**

- Modify: `docs/releases/demo-parity-automated-evidence.md`
- Modify: `docs/releases/v0.1.0-acceptance.md`
- Modify: `.superpowers/sdd/2026-08-17-kopper-shadcn-ui-system/progress.md`

**Interfaces:**

- Consumes: the exact final production source from Task 8.
- Produces: evidence pointers to one observed source SHA/tree and run interval.
- Preserves: every protected signing, notarization, Gatekeeper, physical, independent-review, and promotion row as `Not run` unless genuinely executed.

- [ ] **Step 1: Ensure the exact source tree is clean**

The final review-record commit may be after the production source. Confirm no production/package differences:

```bash
TESTED_SOURCE=$(git log -1 --format=%H -- \
  src tests package.json pnpm-lock.yaml electron-builder.yml electron.vite.config.ts)
TESTED_TREE=$(git rev-parse "$TESTED_SOURCE^{tree}")
printf 'TESTED_SOURCE=%s\nTESTED_TREE=%s\n' "$TESTED_SOURCE" "$TESTED_TREE"
git diff --exit-code "$TESTED_SOURCE"..HEAD -- \
  src tests package.json pnpm-lock.yaml electron-builder.yml electron.vite.config.ts
```

Expected: exit 0 and no output.

- [ ] **Step 2: Run the complete unsigned gate and retain exact timestamps**

```bash
set -euo pipefail
RUN_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm audit:deps
pnpm audit:source
pnpm validate:release-docs
actionlint .github/workflows/*.yml
pnpm package:unsigned
pnpm verify:package "release/mac-universal/Kopper.app"
RUN_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf 'RUN_START=%s\nRUN_END=%s\n' "$RUN_START" "$RUN_END"
```

Expected: every command exits 0. Package verification must report exact `arm64` and `x86_64`, one active native module, application ID `com.kopper.app`, and minimum macOS 14.0. This is unsigned evidence only.

- [ ] **Step 3: Update evidence to the observed exact source**

Update the two release documents with:

- full `TESTED_SOURCE` and tree;
- tested commit time from `git show -s --format=%cI "$TESTED_SOURCE"`;
- `RUN_START` and `RUN_END`;
- observed unit/E2E counts;
- build module count;
- source-audit file count;
- package ASAR count and architecture results; and
- a note that the subsequent evidence-pointer commit changes no production/package source.

Update existing DEMO evidence references to the new short SHA only where the new automated run actually covers them. Keep physical and protected observations `Not run`.

- [ ] **Step 4: Validate evidence traceability and diff scope**

```bash
pnpm validate:release-docs
git diff --check
git diff --name-only "$TESTED_SOURCE"..HEAD -- \
  src package.json pnpm-lock.yaml electron-builder.yml electron.vite.config.ts
```

Expected: canonical row count remains valid and production/package diff output is empty.

- [ ] **Step 5: Commit evidence pointers**

```bash
git add docs/releases/demo-parity-automated-evidence.md docs/releases/v0.1.0-acceptance.md
git commit -m "docs: refresh shadcn UI evidence pointers"
```

- [ ] **Step 6: Record final milestone ruling**

Create/update the ignored progress ledger with:

- task commits;
- exact tested source and tree;
- exact commands and counts;
- visual baseline inventory;
- review findings and fixes;
- explicit release status; and
- the ruling that release remains blocked until all prior promotion-workflow defects and protected/physical evidence requirements are resolved.

Force-add only this scoped ledger if repository convention requires it:

```bash
git add -f .superpowers/sdd/2026-08-17-kopper-shadcn-ui-system/progress.md
git commit -m "docs: close shadcn UI system milestone"
```

- [ ] **Step 7: Run final evidence-only verification**

```bash
pnpm validate:release-docs
pnpm test
pnpm typecheck
git diff HEAD^ HEAD --check
git status --short --branch
```

Expected: validator, unit suite, and typecheck PASS; tracked working tree is clean. Do not publish or promote a release.
