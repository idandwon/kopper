# Kopper Demo-Parity Automated Evidence Map

**Purpose:** Map the storyboard’s `DEMO-*` criteria to repeatable evidence without treating automated renderer coverage as signing, notarization, or physical macOS acceptance.

**Exact candidate SHA:** Recorded by Release-Evidence Refresh Task 12 after all implementation commits and full gates are complete.

| ID | Automated evidence | Remaining manual evidence |
| --- | --- | --- |
| DEMO-01 | `demo-parity.spec.ts` light/dark screenshots at 380×640 and 340×480; `windowManager.test.ts` secure frameless material options. | Confirm native vibrancy, shadow, and drag feel on a physical macOS 14+ desktop. |
| DEMO-02 | `App.test.tsx`, `PanelShortcuts.test.tsx`, and visual baselines verify search/menu hierarchy and keyboard routing. | Confirm native pointer feel and menu placement. |
| DEMO-03 | Visual baselines and `NoteCard.test.tsx` verify compact sections, counts, and clamped previews. | Review real long-note scanning with representative user content. |
| DEMO-04 | `NoteCard.test.tsx` verifies full DOM/accessibility content behind preview clamp; editor and context-menu suites verify full-content paths. | VoiceOver review of clamped and expanded content. |
| DEMO-05 | Capture coordinator/window tests verify persistence precedes outcome publication and the main panel is never activated by HUD acknowledgement. | Verify source selection/focus in every physical source application. |
| DEMO-06 | `windowManager.test.ts` verifies detached, click-through, secure HUD behavior, latest-outcome queueing, and 1,800 ms dismissal. | Observe HUD placement and nonactivation on a physical multi-display Mac. |
| DEMO-07 | Capture outcome/App tests verify exact authoritative note-ID highlight and `scrollIntoView`; coordinator tests verify no success before persistence. | Observe insertion choreography during real global capture. |
| DEMO-08 | Capture runtime/coordinator automated suites cover source-independent orchestration. | Full clean-machine application capture matrix remains mandatory. |
| DEMO-09 | `demo-parity.spec.ts` verifies two consecutive Cmd+Enter prompts clear only after acknowledgement and retain focus. | Confirm perceived responsiveness with long drafts on physical hardware. |
| DEMO-10 | `NoteComposer.test.tsx` and visual baselines verify the section-aware single-surface composer and pointer Add path. | VoiceOver and pointer review at minimum panel size. |
| DEMO-11 | Selection reducer, NoteCard, App, lifecycle presentation, and demo E2E tests verify focus/selection/capture/completion distinctions. | Confirm non-color distinctions under macOS accessibility display settings. |
| DEMO-12 | `NoteContextMenu.test.tsx` verifies applicable actions and visible keyboard equivalents. | Confirm menu material and keyboard discoverability on macOS. |
| DEMO-13 | `demo-parity.spec.ts` and document workflow E2E verify displayed order and Kopper’s intentional unordered Markdown-list output. | None beyond release regression execution. |
| DEMO-14 | Panel feedback tests and demo E2E verify exact clipboard content, accessible success count, and structured failure feedback. | Cross-application paste checks remain part of physical acceptance. |
| DEMO-15 | Light/dark visual baselines verify Oxide Ledger colors, rail, surfaces, and original iconography. | Independent originality/design review before release promotion. |

## Visual baselines

- `tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-light-380x640-darwin.png`
- `tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-light-340x480-darwin.png`
- `tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-dark-380x640-darwin.png`
- `tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-dark-340x480-darwin.png`

These screenshots are macOS renderer baselines. They do not prove native Accessibility behavior, source focus preservation, system-level HUD placement, signing, notarization, stapling, or Gatekeeper acceptance.
