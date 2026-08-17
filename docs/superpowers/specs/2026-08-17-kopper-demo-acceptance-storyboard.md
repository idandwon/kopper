# Kopper Demo Acceptance Storyboard

**Date:** 2026-08-17

**Status:** Binding reference evidence for the Kopper demo-parity plan

**Reference:** [shadcn Copper](https://shadcn.com/copper)

## 1. Purpose

This storyboard records what the Copper demo visibly demonstrates and translates those observations into original Kopper acceptance criteria. It is not permission to copy Copper’s brand, logo, exact colors, typography, marketing, or ornamental details.

Kopper keeps its approved **Oxide Ledger** identity, lifecycle rail, local-only architecture, secure Electron configuration, repository-authoritative mutations, accessibility requirements, and release evidence rules.

## 2. Source Integrity

The inspected asset was downloaded directly from `https://shadcn.com/copper.mp4` on 2026-08-17.

| Property | Observed value |
| --- | --- |
| SHA-256 | `bb357adb9077dc7d2a3b76051bb159c0a6c350ea5689031449188ce0b8812666` |
| Duration | 47.253 seconds |
| Video | 1920 × 1080, 30 fps |
| Size | 10,327,288 bytes |
| HTTP ETag | `"fe021372d66c694c91218aa100d89f58"` |

The complete video was inspected as a two-second contact sheet, individual full-resolution keyframes, and denser frame sequences around capture and composer submission. Temporary extracted frames are analysis material and are not committed.

## 3. Evidence Rules

- **Observed** means the behavior is visible in the video.
- **Inferred** means the video suggests a behavior but does not prove its input, ordering, or failure semantics.
- **Not demonstrated** means the feature may exist, but this video cannot be used as evidence for it.
- Video editing overlays such as `Shift + Shift`, title cards, zooms, and cuts are not application UI.
- Exact animation duration cannot be inferred across an editorial cut.
- Existing Kopper requirements win when visible reference behavior conflicts with the approved product contract, unless this document records an explicit ruling.

## 4. Timestamped Storyboard

| Time | Evidence | Observation | Kopper implication |
| --- | --- | --- | --- |
| 00.0–02.7 | Observed | Title card: capture something needed later with a quick shortcut. | The opening product thesis is capture without interrupting the current task. |
| 02.8–07.6 | Observed | A chat response is generated in a normal source application while a narrow floating panel sits to the right. | The panel must coexist with another app rather than become a full workspace. |
| 07.7–10.7 | Observed | Text is selected in the source app; an editorial `Shift + Shift` overlay appears; a note is appended in the floating panel; a small black `Captured` HUD appears over the source-app area. | Capture must not require activating the panel. Successful acknowledgement is compact and detached from the panel content. |
| 10.8–14.4 | Observed | A second source selection is captured. The selection remains visible, the panel remains in place, the note is appended at the bottom of its section, and another detached `Captured` HUD appears. | Repeated captures preserve source context and append deterministically to the active section. |
| 14.5–17.8 | Observed | Close-up of the panel: one search field, one overflow button, uppercase section labels with divider rules, rounded note cards, circular lifecycle controls, and a bottom composer. | The primary panel surface is intentionally sparse. Long notes are compact previews rather than unbounded cards. |
| 17.9–20.0 | Observed | Title card: capture works everywhere. | Cross-application capture is part of the core promise. |
| 20.1–21.1 | Observed | macOS app switcher moves from ChatGPT to another AI application. | Global capture should not depend on one source application. |
| 21.2–25.9 | Observed | Richly formatted text is selected in the second application; `Shift + Shift` appears; a new card is appended while source selection remains. | Cross-app focus preservation is required. The displayed card preserves emphasis, but the video does not prove whether the app transformed HTML, received Markdown plain text, or used another representation. |
| 26.0–28.1 | Observed | Title card: write prompts that are not ready to send. | Manual prompt entry is a first-class workflow, not a secondary settings flow. |
| 28.2–30.6 | Observed | The bottom composer is focused with a strong outline. A prompt is typed into the same card-shaped surface. | Composer focus must be unmistakable and remain within one visual surface. |
| 30.7–31.0 | Observed | The typed prompt becomes a note, the composer clears, remains focused, and is immediately ready for another prompt. The list scroll position adjusts to keep the new note and composer visible. | Acknowledged submission must support consecutive prompt entry without pointer refocus. |
| 31.1–34.5 | Observed | A second prompt is typed and added through the same workflow. | Repeated manual capture should be frictionless and preserve active-section placement. |
| 34.6–36.5 | Observed | Title card: send prompts to chat with one shortcut. | Copying selected notes back to the source workflow is part of the primary loop. |
| 36.6–38.0 | Observed | One card is selected with a strong blue outline. | Selection must be visible independently of card content and completion control. |
| 38.1–39.1 | Observed | A second card is additively selected; both cards retain outlines. | Multi-selection must remain legible and ordered. The exact modifier is not visible. |
| 39.2–40.6 | Observed | A translucent context menu opens with shortcut labels. Visible actions include Copy, Copy as List, Mark as Done, Expand, Edit, Edit in New Window, Merge Notes, and Move to. Copy as List is chosen. | Applicable actions and keyboard equivalents should be visible in the context menu; batch selection changes availability. |
| 40.7–43.4 | Observed | Focus returns to the chat composer and the selected prompts are pasted as a two-item ordered list. | Copy preserves displayed order and is immediately usable in another app. |
| 43.5–45.5 | Observed | Feature card lists Merge Notes, Sections, Markdown, Copy as List, Search, Custom Shortcuts, Local Files, No Tracking, No Account, Free Updates, Keyboard-First, and Native Mac App. | Most listed behavior already belongs to Kopper; automatic updates remain an explicit Kopper non-goal. |
| 45.6–47.253 | Observed | End card shows the Copper URL. | No Kopper implementation requirement. |

## 5. Reference Surface Anatomy

### 5.1 Shell

The visible panel is a narrow, tall, frameless macOS utility with a large outer radius, cool translucent material, subtle border, and strong desktop shadow. It remains visually subordinate to the source application.

Kopper should reproduce that hierarchy using Oxide Ledger tokens and its lifecycle rail. It must not reproduce Copper’s exact neutral palette or brand styling.

### 5.2 Command surface

The reference keeps only these controls permanently visible at the top:

1. Search
2. Overflow menu

The video does not show permanent Active/Completed tabs, Add Section, Undo, pinning, or settings controls. Kopper may retain all capabilities, but low-frequency controls should not dominate the primary surface.

### 5.3 Sections and cards

- Section labels are small, uppercase, and followed by a hairline divider.
- Cards use a distinct light surface against the panel material.
- Every card has a circular lifecycle control.
- Long cards are visually clamped to a compact preview with an ellipsis.
- Markdown emphasis is visible in at least two cards.
- The video does not show hover-only actions on cards.

### 5.4 Composer

The composer is always one card-shaped surface anchored at the bottom. Its circular leading mark aligns with note cards. The active section appears in parentheses in the placeholder. Focus adds a strong outline.

Submission visibly clears the acknowledged text, inserts a new card, retains composer focus, and keeps the latest content visible. The video does not reveal whether Enter, Cmd+Enter, or another input submitted the note.

### 5.5 Selection and menu

Selected cards receive a strong outline without relying on fill color. Multi-selection leaves every selected card outlined. The context menu resembles native macOS material and displays keyboard equivalents aligned to the right.

### 5.6 Capture acknowledgement

The visible `Captured` acknowledgement is a small detached dark HUD near the source workflow, not a toast inside the panel and not a temporary reveal of the complete panel. The source selection remains visible after capture.

The video only shows capture while the panel is already visible. Hidden-panel behavior is therefore **not demonstrated**.

## 6. Demo Acceptance Criteria

### DEMO-01 — Floating utility hierarchy

At the default panel size, Kopper appears as a narrow floating macOS utility with rounded clipping, distinct desktop shadow, translucent Oxide Ledger material, and the lifecycle rail. It does not resemble a full document window.

### DEMO-02 — Sparse primary command surface

The resting panel prioritizes search and one overflow menu. Lifecycle switching remains accessible but visually quiet. Add Section, Undo, pinning, and Settings do not compete equally with search.

### DEMO-03 — Compact section scanning

Sections use concise uppercase labels, divider rules, and counts where Kopper’s design requires them. Note previews remain compact enough to scan several notes at once.

### DEMO-04 — Complete content access

A clamped preview never destroys or truncates persisted note content. Full content remains available through Expand, Edit, Edit in New Window, keyboard access, and assistive technology.

### DEMO-05 — Source-preserving capture

After an acknowledged capture, the source application remains frontmost and its selection remains visually undisturbed where the source app permits. Kopper does not steal keyboard focus.

### DEMO-06 — Detached capture HUD

An acknowledged capture presents a small, nonactivating, bounded-lifetime HUD separate from panel content. If the main panel is hidden, it remains hidden. Failure acknowledgements use equally bounded, specific copy without implying success.

### DEMO-07 — Authoritative note insertion

Only after persistence acknowledgement, the captured note appears at the end of the active section in authoritative order. If visible, Kopper reveals and highlights that exact note ID. Failed persistence creates no presentation-only note.

### DEMO-08 — Cross-application operation

The same capture workflow works across the clean-machine source matrix already defined by Kopper’s manual acceptance procedure. The reference video itself demonstrates two distinct AI applications.

### DEMO-09 — Consecutive prompt entry

After an acknowledged manual add, the composer clears, retains focus, and is immediately ready for another prompt. A failed add preserves the draft. New content remains visible without manual scrolling.

### DEMO-10 — Single-surface composer

Resting, focused, multiline, and persisted-draft states remain one coherent composer surface. Secondary information does not form a permanent footer toolbar. Kopper retains Cmd+Enter because the reference does not prove a replacement shortcut.

### DEMO-11 — Distinct focus and selection

Keyboard focus, single selection, additive selection, range selection, capture highlight, and completion state are distinguishable without color alone. Every selected card remains visibly selected.

### DEMO-12 — Contextual action hierarchy

The note context menu exposes only applicable actions and displays keyboard equivalents for Copy, Copy as List, Mark as Done/Restore, Edit, Edit in New Window, and Merge where applicable.

### DEMO-13 — Ordered multi-note operation

Multi-note copy follows displayed note order. Kopper intentionally retains its approved Markdown unordered-list representation (`- item`) rather than Copper’s visibly ordered representation (`1. item`). This is a documented product variance, not a parity defect.

### DEMO-14 — Immediate clipboard reuse

After Copy or Copy as List succeeds, another application can paste the exact expected representation without opening an additional Kopper confirmation flow. Kopper announces success accessibly and reports structured failures.

### DEMO-15 — Original identity

Kopper retains Oxide Ledger’s mineral, copper, and verdigris semantics, lifecycle rail, theme system, and original iconography. No Copper name, logo, exact palette, marketing copy, or visual trademark is copied.

## 7. Current Kopper Gap Matrix

| Acceptance | Current state at `38999b5` | Gap | Owning task |
| --- | --- | --- | --- |
| DEMO-01 | Partial | Secure frameless 380 × 640 panel exists, but material is mostly opaque/flat, drag intent is absent, radius/elevation are under-resolved. | 3, 5 |
| DEMO-02 | Does not meet | Search shares the header with a second row containing Active/Completed, panel menu, Add Section, and Undo. | 4 |
| DEMO-03 | Partial | Section labels/dividers/counts exist; cards share the panel token, have minimal elevation, and long previews are unbounded. | 5 |
| DEMO-04 | Partial | Expand/edit paths exist, but there is no deliberate preview clamp or complete Markdown typography. | 5 |
| DEMO-05 | Meets core behavior | Capture is nonactivating and clipboard-safe; physical source-selection preservation remains unverified. | 8, 12 |
| DEMO-06 | Does not meet | A hidden capture calls `showInactive()` on the entire main panel, and `CaptureToast` renders inside that panel. | 8 |
| DEMO-07 | Partial | Persistence is authoritative and exact note ID is highlighted; the card is not deliberately revealed/settled and hidden capture flashes the panel. | 8 |
| DEMO-08 | Partial | Global implementation exists and automated capture coordination is covered; clean physical application matrix remains `Not run`. | 8, 12 |
| DEMO-09 | Partial | Composer clears only through acknowledged document state and remains mounted; latest note visibility and consecutive-entry choreography are not explicit acceptance behavior. | 7, 11 |
| DEMO-10 | Does not meet | Composer is a textarea plus a permanent section/footer/action row, visually reading as nested controls rather than one surface. | 7 |
| DEMO-11 | Partial | Focus and selection semantics exist, but selected fill/ring, focused ring, and capture ring compete and are visually subtle. | 6 |
| DEMO-12 | Partial | Applicable actions exist, but shortcut equivalents are not displayed in the renderer context menu. | 4, 6 |
| DEMO-13 | Intentional variance | Display order is preserved; Copy as List emits approved unordered Markdown rather than the reference’s ordered list. | 6 documentation only |
| DEMO-14 | Partial | Clipboard result is structured, but success is ignored by `SectionGroup`; failures are silently caught. | 6 |
| DEMO-15 | Meets | Original branding, themes, and lifecycle rail already exist. Later styling must preserve them. | All reviews |

## 8. Explicit Rulings and Non-Goals

### 8.1 Preserve exact-text capture

The reference cards visibly retain bold and italic emphasis after capture, but the video does not prove the clipboard representation or conversion method. Kopper’s approved design requires preserving selected text without transformation.

**Ruling:** this plan does not add HTML-to-Markdown conversion or rich capture. Supported clipboard representations still must be restored exactly.

### 8.2 Preserve Kopper’s unordered list contract

The reference pastes an ordered list. Kopper’s approved specification and automated contract emit Markdown list items using `-`.

**Ruling:** preserve Kopper’s unordered list output. Do not silently change clipboard compatibility for visual parity.

### 8.3 Keep the lifecycle rail

Copper has no visible edge rail.

**Ruling:** retain the rail because it is Kopper’s approved signature and communicates lifecycle beyond color.

### 8.4 Do not infer completion animation from this video

The menu contains Mark as Done, but the action is not performed. Completed view, restore, deletion, pinning, window dragging, settings, onboarding, recovery, and theme editing are not demonstrated.

**Ruling:** completion choreography remains required by the original Oxide Ledger specification, not by reference-video evidence.

### 8.5 Do not copy editorial overlays

The large `Shift + Shift` labels and white marketing title cards are video editing, not application UI.

**Ruling:** Kopper implements only its compact capture HUD and product interface.

### 8.6 No automatic updates

The feature card advertises free updates.

**Ruling:** automatic updates remain outside Kopper v0.1 because the approved design explicitly excludes them.

## 9. Review Use

Every implementation task must identify the `DEMO-*` criteria it changes. Reviewers should reject:

- claims based on behavior not demonstrated here;
- changes that copy Copper branding or exact visual identity;
- presentation states that precede acknowledged persistence;
- hidden note content without an accessible full-content path;
- focus-stealing capture acknowledgements;
- replacement of Kopper’s approved unordered list output;
- broad UI additions unrelated to a storyboard gap or original specification.

Task 11 must produce an evidence map showing which `DEMO-*` criteria are automated, which require a deterministic visual baseline, and which remain physical-manual acceptance.
