# Kopper Design Specification

**Date:** 2026-08-16

**Status:** Approved design, pending written-spec review

## 1. Product Summary

Kopper is a local-first, keyboard-driven macOS utility for capturing text from any application and keeping short notes and prompts organized for later reuse. It combines a scratchpad, clipboard queue, and lightweight task list in a compact floating window.

Kopper is inspired by the interaction model demonstrated by shadcn’s Copper app but uses original branding and the original **Oxide Ledger** visual system. It is not a visual or trademark replica.

The first release targets macOS 14 Sonoma and later. It will be distributed directly as a signed and notarized application rather than through the Mac App Store.

## 2. Goals

The first release must let a user:

1. Capture selected text from another macOS application by pressing Shift twice.
2. Create and edit Markdown notes directly in Kopper.
3. Organize notes into ordered sections.
4. Search active and completed notes.
5. Select one or more notes and copy, copy as a Markdown list, complete, merge, move, or delete them.
6. Work primarily from the keyboard while retaining complete pointer accessibility.
7. Keep all content local in one transparent, versioned JSON file.
8. Customize the complete visual theme and import or export compatible theme definitions.
9. Install and run a signed, notarized build on a clean macOS 14 or newer machine.

## 3. Non-Goals

The first release will not include:

- Accounts, cloud synchronization, collaboration, or remote storage
- Mobile or Windows versions
- Browser extensions
- AI generation or provider integrations
- Rich attachments, images, or arbitrary files
- A Mac App Store build
- Automatic software updates
- Usage analytics, telemetry, or crash reporting

## 4. Technical Direction

Kopper will use Electron with React and TypeScript.

- **Electron main process:** operating-system integration, window lifecycle, global input monitoring, clipboard access, persistence, and IPC handlers
- **React renderer:** note interface, Markdown editing, search, selection, context menus, settings, onboarding, recovery, and theming
- **Preload bridge:** a narrow, typed API exposed through `contextBridge`
- **UI foundation:** Tailwind CSS and shadcn/ui components using semantic CSS variables
- **Global key monitoring:** `uiohook-napi`, used to recognize the modifier-only double-Shift gesture
- **Selection capture:** a fixed `osascript` command sends Cmd+C to the active application; Electron reads the resulting pasteboard and restores the previous clipboard contents
- **Packaging:** Electron Builder producing a universal signed `.app` and notarized `.dmg`

Kopper will not contain a custom Swift helper. Native behavior that Electron does not expose directly will be handled through the maintained global-input dependency and fixed macOS scripting.

## 5. System Boundaries

### 5.1 Main Process Modules

#### `WindowManager`

Owns the frameless floating `BrowserWindow`, screen placement, show/hide behavior, pinning, workspace visibility, and focus restoration. The renderer requests intent such as “hide” or “toggle pin”; it does not manipulate native windows directly.

#### `GlobalShortcutMonitor`

Consumes global keyboard events and emits high-level commands. Double-Shift recognition is a testable state machine with an explicit timing window and cancellation when another key intervenes. It also manages the configurable show/hide shortcut.

#### `SelectionCapture`

Coordinates a capture transaction:

1. Snapshot all supported clipboard representations.
2. Send Cmd+C to the active application using a static script.
3. Wait for the pasteboard change count to advance within a bounded timeout.
4. Read non-empty selected text.
5. Restore the original clipboard in a guaranteed cleanup path.
6. Submit captured text to `NoteRepository`.

It never interpolates captured or user-provided content into shell or AppleScript source.

#### `PermissionManager`

Checks and requests macOS Accessibility trust with Electron’s `systemPreferences.isTrustedAccessibilityClient`. It reports a small explicit state model: unknown, granted, denied, or restricted.

#### `NoteRepository`

Owns the in-memory document, schema validation, migrations, ordered mutations, import/export, atomic persistence, and recovery behavior. No renderer code reads or writes the store file directly.

#### `ThemeRepository`

Validates built-in and imported themes, derives missing Kopper-specific tokens from shadcn semantic tokens, and applies user preference changes to the persisted document.

### 5.2 Renderer Feature Modules

- **Command surface:** search field, window controls, section list, and bottom composer
- **Notes:** cards, keyboard focus, range selection, multi-selection, completion, and context actions
- **Editor:** inline Markdown editing plus expanded editing in a separate window
- **Sections:** create, rename, reorder, delete, and move-note flows
- **Completed view:** searchable completed notes with restoration and deletion
- **Settings:** shortcut configuration, window behavior, theme editor, theme import/export, and data import/export
- **Onboarding:** Accessibility permission explanation and recheck flow
- **Recovery:** malformed-store handling without destructive overwrite

### 5.3 IPC Contract

Every IPC message is declared in one shared TypeScript contract and validated at runtime. The renderer may request domain operations such as capture, add, edit, move, merge, complete, copy, import, and export. Main-process responses use typed success or structured-error results.

The preload bridge exposes only approved operations and subscriptions. Raw `ipcRenderer`, filesystem, process, shell, and clipboard objects are not exposed.

## 6. Window and Interaction Model

Kopper opens as a compact floating panel approximately 380 × 640 pixels near the right edge of the active display. It is resizable within defined minimum dimensions. It may be pinned above other windows or dismissed without quitting. Opening and hiding the panel must restore focus predictably.

Capturing selected text does not activate Kopper or steal focus from the source application. Successful capture briefly presents a non-activating acknowledgment and highlights the inserted note if the panel is visible.

### 6.1 Default Commands

| Command | Default shortcut |
| --- | --- |
| Capture selected text | Shift, Shift |
| Show or hide Kopper | Cmd+Shift+Space |
| Focus search | Cmd+K |
| Edit focused note | Return |
| Save edit | Cmd+Return |
| Mark selected notes done | Space |
| Copy selected notes | Cmd+C |
| Copy selected notes as a Markdown list | Shift+Cmd+C |
| Merge selected notes | Shift+Cmd+M |
| Delete selected notes | Delete |

Global shortcuts are customizable. Invalid or conflicting shortcuts are rejected with a specific explanation and do not replace the last valid configuration.

### 6.2 Notes

A note contains Markdown text and belongs to one section. Notes are ordered explicitly within a section. A user can add a note through the composer, edit inline, or open an expanded editor.

Cmd-click toggles individual selection. Shift-click extends selection across the displayed ordering. Keyboard focus and selection remain distinct and visibly indicated.

Copy preserves note content and ordering. Copy as list emits each selected note as a Markdown list item in displayed order. Merge replaces selected notes with one note in displayed order, separated by newlines, and supports undo for the current session. Delete also supports session undo.

Completing a note records its completion timestamp and moves it out of active sections into the searchable Completed view. Completed notes can be restored to their previous section and order when that section still exists; otherwise they return to the first available section.

### 6.3 Sections

Users can create, rename, reorder, and delete sections. Deleting a non-empty section requires choosing another destination or explicitly deleting its notes. Notes move between sections through keyboard commands or context menus.

### 6.4 Context Menu

The note context menu exposes applicable actions only:

- Copy
- Copy as list
- Mark as done or restore
- Expand
- Edit
- Edit in new window
- Merge notes
- Move to section
- Delete

## 7. Data Model and Persistence

Kopper stores user content and preferences in:

`~/Library/Application Support/Kopper/kopper.json`

The top-level document contains:

- `schemaVersion`
- ordered `sections`
- `notes`
- active section identifier
- shortcut preferences
- window preferences
- appearance mode and active theme
- custom theme definitions
- an optional editor draft

Each section has a stable identifier, title, order, creation timestamp, and update timestamp. Each note has a stable identifier, section identifier, Markdown body, order, creation timestamp, update timestamp, optional completion timestamp, and enough previous-position metadata to restore a completed note.

Search indexes and transient selection state are derived and are not persisted.

### 7.1 Atomic Writes

Every committed mutation follows this sequence:

1. Update an immutable in-memory document.
2. Validate the complete next document.
3. Serialize to a temporary file in the same directory.
4. Flush file contents.
5. Atomically rename the temporary file over `kopper.json`.
6. Acknowledge success to the renderer.

Kopper maintains one persistent data file and does not silently create backup copies. Explicit Export and Import commands let the user manage copies themselves.

### 7.2 Migration

The repository reads `schemaVersion` before domain decoding. Migrations are deterministic, sequential, and covered by fixtures. A newer unsupported schema opens a read-only recovery state rather than being overwritten.

## 8. Capture Behavior and Edge Cases

A valid capture contains non-empty text after preserving the user’s original text exactly; whitespace-only selection is treated as empty. Kopper does not transform or summarize captured text.

- **Accessibility denied:** show onboarding with a button to open the relevant System Settings pane and a “Check again” action.
- **No selected text:** create no note and show a short “Nothing selected” acknowledgment.
- **Clipboard timeout:** restore the previous clipboard and report that capture failed.
- **Unsupported clipboard content:** restore it without modification; only the selected textual representation becomes a note.
- **Repeated double-Shift:** serialize capture transactions so clipboard snapshots cannot overlap.
- **Secure input or protected application:** report that the source app did not provide selectable text.
- **Kopper active during capture:** capture selected text from Kopper’s editor using the same transaction without recursively triggering an additional command.

## 9. Visual Design: Oxide Ledger

Oxide Ledger gives Kopper an original identity while retaining the compact, quiet, translucent utility character appropriate to macOS.

### 9.1 Signature Element

A narrow lifecycle rail runs along the panel edge. Its visual vocabulary moves from raw copper for newly captured work toward verdigris for organized and completed work. State is never communicated by color alone; labels, icons, movement, and position reinforce it.

### 9.2 Default Palette

The default theme derives from these named colors:

- Mineral: `#F6F9F6`
- Deep Oxide: `#173D35`
- Raw Copper: `#B86138`
- Verdigris: `#2E8775`
- Mist: `#C7D9D5`

All implementation styles reference semantic tokens rather than these values directly.

### 9.3 Typography

- SF Pro Text for notes and controls
- SF Mono for section labels, counts, shortcut hints, and capture acknowledgments
- Restrained semibold emphasis identifies the scannable thesis within a note

System fonts avoid bundled font licensing and reinforce native macOS rendering.

### 9.4 Motion

One orchestrated capture acknowledgment glides into view without activation. New notes settle into their section with a short vertical transition. Completion visually moves from copper to verdigris before the card collapses into Completed.

Reduced Motion replaces translation and collapse with immediate layout changes and brief opacity feedback.

## 10. Theme System

Every shadcn/ui component consumes semantic variables, including:

- `--background`, `--foreground`
- `--card`, `--card-foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--accent`, `--accent-foreground`
- `--muted`, `--muted-foreground`
- `--border`, `--input`, `--ring`
- `--radius`

Kopper adds semantic lifecycle tokens such as `--capture`, `--organized`, and `--completed`. Imported themes that omit these values derive them deterministically from the closest shadcn tokens.

Milestone one includes:

- Light, dark, and system appearance modes
- Oxide Ledger light and dark defaults
- Bundled theme presets
- A live editor for colors and corner radius
- Reset for one token or the complete theme
- Import and export of versioned, shadcn-compatible JSON theme documents
- Validation of syntax, required tokens, supported color formats, and minimum readable contrast

Invalid themes are previewed only after validation and never replace the active theme automatically.

## 11. Error and Recovery Model

Expected failures return structured errors with a stable code, user-facing message, retryability, and optional recovery action.

- A failed save leaves the renderer’s uncommitted state intact and presents a persistent Retry action.
- A malformed store is never overwritten automatically.
- Recovery offers opening another file, exporting the damaged bytes, or explicitly creating a new store.
- Incomplete editor text is represented by one draft in the same data document and is cleared only after successful save or explicit discard.
- Destructive actions provide session undo and never imply success before the repository acknowledges persistence.

## 12. Security and Privacy

Kopper uses:

- `contextIsolation: true`
- Renderer sandboxing
- `nodeIntegration: false`
- A restrictive Content Security Policy
- Runtime validation of every IPC payload and imported file
- No remote renderer content
- No analytics, telemetry, crash reporting, accounts, or note-related network requests

Accessibility access is used only to observe the configured global shortcuts and perform explicit selection capture. The capture script is static and contains no user-controlled interpolation. Captured content remains local.

## 13. Testing Strategy

### 13.1 Unit Tests

- Double-Shift timing, cancellation, and de-duplication
- Capture transaction cleanup and clipboard restoration
- Repository mutations, ordering, migrations, and atomic-write failures
- Search, completion, restore, merge, and copy-as-list behavior
- Theme derivation, import validation, contrast validation, and reset
- Shortcut conflict validation

### 13.2 Renderer Tests

- Composer and Markdown editor behavior
- Note focus, range selection, and multi-selection
- Context-menu availability
- Section management
- Completed view and restoration
- Settings, theme editing, permission onboarding, and recovery screens
- Keyboard-only navigation, visible focus, and Reduced Motion behavior

### 13.3 Electron Integration Tests

- Typed preload bridge and IPC authorization
- Persistence across relaunch
- Import and export
- Window show, hide, pin, and display placement
- Shortcut preference persistence
- Theme application across all windows

### 13.4 macOS Acceptance Tests

A signed build must capture selected text from Chrome, ChatGPT, Claude, Cursor, TextEdit, and another native text application. Tests verify that source focus and prior clipboard data survive success, empty selection, denial, timeout, and source-app closure.

## 14. Distribution and Acceptance

Electron Builder creates a universal application and DMG. Release builds use hardened runtime, Developer ID signing, and Apple notarization. Signing credentials exist only in the release environment.

The first release is accepted when a clean macOS 14 or newer machine can:

1. Install and launch the notarized application.
2. Complete Accessibility permission onboarding.
3. Capture selected text globally with double-Shift without losing source focus or clipboard contents.
4. Create, edit, search, organize, select, merge, complete, restore, move, copy, copy as list, and delete notes.
5. Customize shortcuts and the complete theme.
6. Export and re-import a valid shadcn-compatible theme.
7. Relaunch without content or preference loss.
8. Recover safely from invalid imported data without overwriting the active store.
9. Quit and uninstall without leaving a running background process.
