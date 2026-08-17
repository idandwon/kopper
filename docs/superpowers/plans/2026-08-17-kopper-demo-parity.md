# Kopper Demo-Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Kopper’s floating-panel experience to the interaction clarity and finish demonstrated by shadcn’s Copper video while preserving Kopper’s original Oxide Ledger identity, security model, and authoritative persistence behavior.

**Architecture:** The work keeps the existing domain, persistence, capture, and IPC modules authoritative. It decomposes the renderer panel into deep feature-local modules, introduces narrow presentation seams for transient feedback and authoritative note transitions, and refines the existing transparent Electron window without broadening renderer privileges.

**Tech Stack:** Electron 43, React 19, TypeScript 7 strict mode, Tailwind CSS 4, Radix/shadcn primitives, Vitest, Testing Library, Playwright.

**Specs:**

- `docs/superpowers/specs/2026-08-16-kopper-design.md`
- `docs/superpowers/specs/2026-08-17-kopper-demo-acceptance-storyboard.md` (produced by Task 1; binding for Tasks 2–12)

## Global Constraints

- Match the reference’s interaction clarity and pacing, not its name, logo, exact palette, or trademarked presentation. Oxide Ledger and the lifecycle rail remain Kopper’s identity.
- Preserve repository authority: UI state must never imply a document mutation succeeded before acknowledged persistence.
- Preserve `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, local-only renderer policy, one atomic JSON store, and no telemetry/accounts/sync/remote renderer content.
- Apply the canonical `vercel-react-best-practices` guidance relevant to a client-rendered Electron app: direct imports, derived state during render, functional state updates, narrow effect dependencies, no inline component definitions, deduplicated global listeners, and explicit conditional rendering.
- New and materially modified code uses `const`, immutable transformations, meaningful domain names, guard clauses, and named variables for complex conditions.
- No TypeScript type assertions (`as`, angle-bracket casts) or non-null assertions (`!`) in new or materially modified code. Narrow with schemas, discriminated unions, typed builders, or platform checks.
- Effects synchronize with external systems only. Interaction logic belongs in event handlers or reducers.
- Do not create junk-drawer files, generic `utils`, barrel exports, tiny pass-through helpers, or shallow prop-forwarding modules. Extract a module only when it owns meaningful behavior behind a small interface.
- Keep files and functions single-purpose without imposing arbitrary line-count splits. Follow existing feature-local naming and direct-import conventions.
- Preserve keyboard and pointer equivalence, visible focus, VoiceOver names, WCAG contrast, and `prefers-reduced-motion` behavior.
- Do not claim signed/notarized/physical acceptance without protected artifact evidence.

---

### Task 1: Reference Acceptance Storyboard

**Files:**

- Create: `docs/superpowers/specs/2026-08-17-kopper-demo-acceptance-storyboard.md`
- Modify: `docs/superpowers/plans/2026-08-17-kopper-demo-parity.md` only if frame evidence invalidates an assumption

**Interfaces:**

- Consumes: the 47.253-second `https://shadcn.com/copper.mp4`, the approved Kopper design spec, and current renderer/main implementation.
- Produces: timestamped observations, demo acceptance IDs, a reference-versus-Kopper gap matrix, explicit non-goals, and rulings for reference behavior that conflicts with the approved Kopper contract.

- [x] Inspect the complete video and extract key frames around capture, cross-app capture, prompt entry, selection, context menu, copy-as-list, and paste.
- [x] Record only visible behavior as reference evidence; label inferred behavior and behavior not demonstrated.
- [x] Compare each visible behavior with current Kopper implementation and the approved design spec.
- [x] Resolve conflicts in favor of the approved Kopper product contract unless an explicit ruling changes the later task target.
- [x] Define stable `DEMO-*` acceptance IDs used by implementation reviews and final evidence.
- [x] Validate the document for complete timestamps, no unsupported claims, and one unambiguous status per gap.
- [x] Commit the storyboard and plan transcription.

### Task 2: Panel Module Decomposition

**Files:**

- Modify: `src/renderer/src/app/App.tsx`
- Create: `src/renderer/src/app/DocumentPanel.tsx`
- Create: `src/renderer/src/features/panel/PanelShell.tsx`
- Create: `src/renderer/src/features/panel/PanelHeader.tsx`
- Create: `src/renderer/src/features/panel/PanelMenu.tsx`
- Create: `src/renderer/src/features/notes/NoteCollection.tsx`
- Modify/Test: corresponding feature tests and `src/renderer/src/app/App.test.tsx`

**Interfaces:**

- Consumes: `useKopperDocument`, `projectNotes`, selection reducer, existing settings/section modules.
- Produces: a small application router, a panel orchestration module, and feature-local interfaces that later visual and interaction tasks can refine without reopening document ownership.

- [x] Characterize current routing, focus reconciliation, selection, settings, and error behavior with tests.
- [x] Extract modules by owned behavior rather than JSX size; do not add pass-through wrappers.
- [x] Keep derived projection and selection state during render and narrow effect dependencies to primitives.
- [x] Run focused renderer tests, typecheck, and commit.

### Task 3: Native-Feeling Frameless Panel

**Files:**

- Modify: `src/main/window/windowManager.ts`
- Modify: `src/main/window/windowManager.test.ts`
- Modify: `src/renderer/src/features/panel/PanelShell.tsx`
- Modify: `src/renderer/src/styles/globals.css`

**Interfaces:**

- Consumes: existing `WindowManager` public interface and secure BrowserWindow configuration.
- Produces: a safely draggable, clipped, translucent Oxide Ledger panel that preserves native bounds, pinning, focus, and security behavior.

- [x] Add tests for any changed BrowserWindow material/options and preserve secure defaults.
- [x] Add one intentional drag surface and explicit no-drag interactive regions.
- [x] Refine clipping, shadow, backdrop, and minimum-size behavior without copying Copper’s palette.
- [x] Verify light/dark/system modes, bounds persistence, and reduced transparency fallback.
- [x] Run focused tests, typecheck, build, and commit.

### Task 4: Simplified Command Surface

**Files:**

- Modify: `src/renderer/src/features/panel/PanelHeader.tsx`
- Modify: `src/renderer/src/features/panel/PanelMenu.tsx`
- Modify: `src/renderer/src/features/search/SearchField.tsx`
- Create: `src/renderer/src/features/panel/PanelShortcuts.tsx` only if one module owns the single global listener and its routing
- Modify: `src/renderer/src/features/sections/SectionManager.tsx`
- Modify/Test: focused panel/search/section tests

**Interfaces:**

- Consumes: document actions, undo, settings opening, pinning, Active/Completed view selection.
- Produces: a search-plus-menu primary command surface, quiet lifecycle switching, one global panel shortcut listener, and accessible SVG controls via direct imports.

- [x] Lock current keyboard behavior and menu actions with tests.
- [x] Move low-frequency actions out of the always-visible toolbar.
- [x] Centralize Cmd+K and Cmd+Z routing without adding a dependency or duplicate listener.
- [x] Add visible shortcut labels to applicable menus while preserving screen-reader labels.
- [x] Run focused tests, E2E smoke, typecheck, and commit.

### Task 5: Oxide Ledger Surface Completion

**Files:**

- Modify: `src/shared/theme/presets.ts`
- Modify: `src/shared/theme/presets.test.ts`
- Modify: `src/renderer/src/styles/globals.css`
- Modify: `src/renderer/src/features/notes/NoteCard.tsx`
- Modify: `src/renderer/src/features/editor/MarkdownEditor.tsx`
- Modify/Test: theme, note-card, and editor tests

**Interfaces:**

- Consumes: strict theme token schema and existing semantic variables.
- Produces: distinct panel/card/composer/popover elevation, clamped card previews with an explicit expansion path, and complete Markdown typography across all valid themes.

- [x] Add failing tests for preset contrast and card-preview semantics.
- [x] Differentiate surfaces using valid opaque theme tokens and presentation-level blending.
- [x] Implement deterministic preview clamping without hiding content from assistive technology or the expanded editor.
- [x] Style supported Markdown elements and preserve inert links.
- [x] Run theme suites, renderer suites, typecheck, and commit.

### Task 6: Selection and Clipboard Feedback

**Files:**

- Create: `src/renderer/src/features/feedback/PanelFeedback.tsx`
- Create: `src/renderer/src/features/feedback/PanelFeedback.test.tsx`
- Modify: `src/renderer/src/features/notes/NoteCard.tsx`
- Modify: `src/renderer/src/features/notes/NoteContextMenu.tsx`
- Modify: `src/renderer/src/features/sections/SectionGroup.tsx`
- Modify/Test: note selection/context/E2E tests

**Interfaces:**

- Consumes: existing structured `ClipboardCopyResult`, selection state, and copy actions.
- Produces: one deep transient-feedback module, reference-clear selected-card outlines, multi-selection cues, shortcut-labeled actions, and exact copy success/failure announcements.

- [x] Test single selection, additive selection, range selection, context selection, and copy outcomes.
- [x] Keep visual selection distinct from keyboard focus and lifecycle state.
- [x] Route clipboard results through one feedback seam rather than prop-drilling or duplicated timers.
- [x] Preserve Kopper’s approved unordered Markdown-list contract unless the storyboard records an explicit product ruling.
- [x] Run focused tests, clipboard E2E, typecheck, and commit.

### Task 7: Single-Surface Composer

**Files:**

- Modify: `src/renderer/src/features/notes/NoteComposer.tsx`
- Modify: `src/renderer/src/features/notes/NoteComposer.test.tsx`
- Modify: `src/renderer/src/styles/globals.css`

**Interfaces:**

- Consumes: active section, persisted draft, authoritative `execute`, and existing draft debounce/flush contract.
- Produces: one visually unified composer surface that clears only after acknowledged add and remains ready for consecutive prompts.

- [x] Preserve draft persistence, dependent operation order, and failure behavior in characterization tests.
- [x] Remove permanent secondary chrome from the resting composer; expose necessary details without creating a separate footer panel.
- [x] Derive visual expansion from focus/content where useful while retaining the reference’s stable single-surface shape.
- [x] Keep multiline entry and Cmd+Enter; do not infer an unobserved Enter-to-submit contract from video editing.
- [x] Run focused tests, E2E prompt-entry journey, typecheck, and commit.

### Task 8: Capture Choreography and HUD

**Files:**

- Modify: `src/main/window/windowManager.ts`
- Modify: `src/main/window/windowManager.test.ts`
- Create or Modify: a focused main-process capture HUD module if the storyboard requires a detached nonactivating acknowledgment
- Modify: `src/renderer/src/features/capture/CaptureToast.tsx`
- Modify: `src/renderer/src/features/notes/NoteCollection.tsx`
- Modify/Test: capture, window, renderer, and E2E tests

**Interfaces:**

- Consumes: `CaptureOutcome`, authoritative inserted note ID, window visibility/focus state.
- Produces: nonactivating acknowledgment at the storyboard-defined seam, authoritative card reveal/scroll/highlight, and bounded cleanup.

- [x] Characterize visible-panel and hidden-panel capture behavior before changing windows.
- [x] Test that source focus is not stolen and no success state appears before persistence acknowledgement.
- [x] Implement the smallest secure HUD/window change that matches storyboard evidence while preserving hidden-panel product requirements.
- [x] Reveal and highlight the authoritative card with reduced-motion fallback.
- [x] Run focused tests, capture E2E where automatable, typecheck/build, and commit.

### Task 9: Safe Completion Presentation

**Files:**

- Create: `src/renderer/src/features/notes/notePresentationReducer.ts`
- Create: `src/renderer/src/features/notes/notePresentationReducer.test.ts`
- Modify: `src/renderer/src/features/notes/NoteCollection.tsx`
- Modify: `src/renderer/src/features/notes/NoteCard.tsx`
- Modify: `src/renderer/src/styles/globals.css`

**Interfaces:**

- Consumes: authoritative projections and acknowledged completion/restore outcomes.
- Produces: immutable presentation states for pending, acknowledged exit, failed persistence, and reduced motion; document state remains outside the interface.

- [ ] Test reducer transitions without timers or React internals.
- [ ] Show neutral pending state while persistence is unresolved.
- [ ] Retain an acknowledged presentation snapshot for copper-to-verdigris completion and collapse.
- [ ] Restore unchanged presentation and Retry on failure.
- [ ] Run focused tests, completion E2E, typecheck, and commit.

### Task 10: Secondary-State Polish

**Files:**

- Modify: onboarding, recovery, completed, expanded-editor, settings, dialog, and empty-state feature files touched by the storyboard audit
- Modify: `src/renderer/src/styles/globals.css`
- Modify/Test: corresponding focused tests

**Interfaces:**

- Consumes: established panel surfaces and feedback patterns.
- Produces: consistent secondary states at 380×640 and 340×480 without new domain behavior.

- [ ] Add tests for active/completed/search empty states and minimum-size accessibility.
- [ ] Align secondary surfaces without flattening their distinct error/recovery hierarchy.
- [ ] Verify keyboard focus, VoiceOver labels, live regions, contrast, and reduced motion.
- [ ] Run focused suites, typecheck, and commit.

### Task 11: Demo and Visual Regression Gate

**Files:**

- Create: `tests/e2e/demo-parity.spec.ts`
- Create: deterministic screenshot fixtures/baselines under the existing Playwright convention
- Modify: `tests/e2e/fixtures/electronApp.ts` only for production-safe deterministic test setup
- Modify: relevant Vitest tests if final integration exposes gaps

**Interfaces:**

- Consumes: `DEMO-*` acceptance IDs and completed panel behavior.
- Produces: keyboard-only demo journey, light/dark fixed-size visual baselines, and an evidence map from acceptance ID to automated/manual verification.

- [ ] Add the prompt-entry/select/copy/clipboard/complete/restore journey.
- [ ] Add deterministic 380×640 and 340×480 light/dark screenshots with dynamic values controlled or masked.
- [ ] Review changed React code against relevant Vercel rules and the global code constraints.
- [ ] Run focused tests, full Vitest, typecheck, build, E2E repeats, audits, and commit.

### Task 12: Release-Evidence Refresh

**Files:**

- Modify: `tests/manual/macos-capture.md`
- Modify: `docs/releases/acceptance-template.md`
- Modify: `docs/releases/v0.1.0-acceptance.md`
- Modify: `scripts/validate-release-doc-traceability.mjs` only if new canonical rows require validator changes
- Modify: release progress/report artifacts outside tracked source as appropriate

**Interfaces:**

- Consumes: final immutable candidate SHA, `DEMO-*` evidence, existing 76-row canonical release procedure, and unresolved promotion-workflow findings.
- Produces: traceable new automated evidence and honest blocked protected/physical rows.

- [ ] Add storyboard acceptance evidence without weakening or renumbering existing canonical release rows.
- [ ] Re-run complete automated gates against the exact final SHA and record bounded output.
- [ ] Keep signing, notarization, stapling, Gatekeeper, physical capture, and promotion `Not run` until observed.
- [ ] Validate traceability, review evidence integrity independently, and commit documentation-only changes separately.
