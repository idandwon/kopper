import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { KopperDocument } from "../../../shared/domain/document";
import type { KopperError } from "../../../shared/domain/errors";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AddSectionDialog } from "../features/sections/SectionManager";
import { SectionGroup } from "../features/sections/SectionGroup";
import { CompletedView } from "../features/completed/CompletedView";
import { CaptureToast } from "../features/capture/CaptureToast";
import {
  ExpandedEditorWindow,
  expandedEditorNoteId,
} from "../features/editor/ExpandedEditorWindow";
import { NoteComposer } from "../features/notes/NoteComposer";
import { AccessibilityPermissionGate } from "../features/onboarding/AccessibilityPermissionGate";
import { RecoveryScreen } from "../features/recovery/RecoveryScreen";
import { AppearanceSettings } from "../features/settings/AppearanceSettings";
import { DataSettings } from "../features/settings/DataSettings";
import { ShortcutSettings } from "../features/settings/ShortcutSettings";
import {
  initialSelectionState,
  selectionReducer,
} from "../features/notes/selectionReducer";
import { SearchField } from "../features/search/SearchField";
import {
  projectNotes,
  type NoteProjectionView,
} from "../features/search/projectNotes";
import { useKopperDocument } from "./DocumentProvider";

function LifecycleRail() {
  return (
    <div
      className="absolute inset-y-0 left-0 w-1 bg-[linear-gradient(to_bottom,var(--capture),var(--completed))]"
      aria-hidden="true"
    />
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[380px] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-background text-foreground">
      <LifecycleRail />
      <span className="sr-only">Lifecycle: captured to completed</span>
      {children}
    </main>
  );
}

function LoadingState() {
  return (
    <Panel>
      <div className="flex flex-1 items-center justify-center p-6">
        <div
          role="progressbar"
          aria-label="Loading notes"
          aria-valuetext="Loading notes"
          className="h-1 w-24 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/2 rounded-full bg-primary motion-safe:animate-pulse" />
        </div>
      </div>
    </Panel>
  );
}

function GlobalError({
  error,
  retry,
  disabled,
}: {
  error: KopperError;
  retry(): Promise<boolean>;
  disabled: boolean;
}) {
  return (
    <div
      role="alert"
      className="mx-4 mb-2 ml-5 flex items-center gap-3 rounded-lg border border-destructive bg-card p-3 text-sm text-card-foreground"
    >
      <p className="m-0 min-w-0 flex-1">{error.message}</p>
      {error.retryable && (
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => void retry()}
        >
          Retry
        </Button>
      )}
    </div>
  );
}

function ViewButton({
  view,
  current,
  onSelect,
}: {
  view: NoteProjectionView;
  current: NoteProjectionView;
  onSelect(view: NoteProjectionView): void;
}) {
  const active = view === current;
  const label = view === "active" ? "Active notes" : "Completed notes";

  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "secondary" : "ghost"}
      aria-label={label}
      aria-pressed={active}
      onClick={() => onSelect(view)}
    >
      {view === "active" ? "Active" : "Completed"}
    </Button>
  );
}

function DocumentPanel({
  document,
  captureUnavailable = false,
}: {
  document: KopperDocument;
  captureUnavailable?: boolean;
}) {
  const { error, pendingAction, retryLastAction, undo } = useKopperDocument();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<NoteProjectionView>("active");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("appearance");
  const [captureHighlightedNoteId, setCaptureHighlightedNoteId] = useState<
    string | null
  >(null);
  const panelMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [selection, dispatchSelection] = useReducer(
    selectionReducer,
    initialSelectionState,
  );
  const projections = useMemo(
    () => projectNotes(document, query, view),
    [document, query, view],
  );
  const displayedIds = useMemo(
    () => projections.flatMap(({ notes }) => notes.map(({ id }) => id)),
    [projections],
  );
  const previousDisplayedIdsRef = useRef(displayedIds);
  const activeElement = globalThis.document.activeElement;
  const focusedNoteElement =
    activeElement instanceof HTMLElement
      ? activeElement.closest<HTMLElement>(
          "[data-note-id], [data-note-owner-id]",
        )
      : null;
  const focusWasInNoteCollection =
    activeElement instanceof HTMLElement &&
    activeElement.closest("[role=listbox]") !== null;
  const previousFocusedId =
    focusedNoteElement?.dataset.noteId ??
    focusedNoteElement?.dataset.noteOwnerId ??
    selection.focusedId;
  const previousFocusedIndex =
    previousFocusedId === null || previousFocusedId === undefined
      ? -1
      : previousDisplayedIdsRef.current.indexOf(previousFocusedId);
  const fallbackFocusedId =
    focusWasInNoteCollection &&
    previousFocusedId !== null &&
    previousFocusedId !== undefined &&
    previousFocusedIndex >= 0 &&
    !displayedIds.includes(previousFocusedId) &&
    displayedIds.length > 0
      ? displayedIds[Math.min(previousFocusedIndex, displayedIds.length - 1)]
      : undefined;
  const visibleSelection = useMemo(
    () =>
      selectionReducer(selection, {
        type: "reconcile",
        displayedIds,
        fallbackFocusedId,
      }),
    [displayedIds, fallbackFocusedId, selection],
  );
  const busy = pendingAction !== null;

  useEffect(() => {
    dispatchSelection({
      type: "reconcile",
      displayedIds,
      fallbackFocusedId,
    });
    previousDisplayedIdsRef.current = displayedIds;
  }, [displayedIds, fallbackFocusedId]);

  useEffect(() => {
    return window.kopper.onOpenSettings(() => {
      setSettingsTab("shortcuts");
      setSettingsOpen(true);
    });
  }, []);

  useEffect(() => {
    if (visibleSelection.focusedId === null) return;
    const focusedCard = Array.from(
      globalThis.document.querySelectorAll<HTMLElement>("[data-note-id]"),
    ).find(({ dataset }) => dataset.noteId === visibleSelection.focusedId);
    focusedCard?.focus();
  }, [visibleSelection.focusedId]);

  return (
    <div className="contents">
      <Panel>
        <header className="grid gap-2 px-4 pt-4 pb-3 pl-5">
          <SearchField query={query} onQueryChange={setQuery} />
          <div className="flex items-center justify-between gap-2">
            <div
              role="group"
              className="flex rounded-lg border border-border bg-card p-0.5"
              aria-label="Note lifecycle view"
            >
              <ViewButton view="active" current={view} onSelect={setView} />
              <ViewButton view="completed" current={view} onSelect={setView} />
            </div>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button ref={panelMenuTriggerRef} type="button" variant="ghost" size="xs" aria-label="Panel menu">
                    <span aria-hidden="true">•••</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => {
                    setSettingsTab("appearance");
                    setSettingsOpen(true);
                  }}>Settings…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
                <SheetContent onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  panelMenuTriggerRef.current?.focus();
                }}>
                  <SheetHeader>
                    <SheetTitle>Settings</SheetTitle>
                    <SheetDescription>Shortcuts, appearance, and local data controls.</SheetDescription>
                  </SheetHeader>
                  <Tabs value={settingsTab} onValueChange={setSettingsTab} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    <TabsList aria-label="Settings sections"><TabsTrigger value="shortcuts">Shortcuts</TabsTrigger><TabsTrigger value="appearance">Appearance</TabsTrigger><TabsTrigger value="data">Data</TabsTrigger></TabsList>
                    <TabsContent value="shortcuts"><ShortcutSettings captureUnavailable={captureUnavailable} /></TabsContent>
                    <TabsContent value="appearance"><AppearanceSettings /></TabsContent>
                    <TabsContent value="data"><DataSettings /></TabsContent>
                  </Tabs>
                </SheetContent>
              </Sheet>
              <AddSectionDialog />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={busy}
                onClick={() => void undo()}
              >
                Undo
              </Button>
            </div>
          </div>
        </header>

        {captureUnavailable && (
          <div
            role="status"
            className="mx-4 mb-2 ml-5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
          >
            Capture unavailable — Accessibility access has not been granted.
          </div>
        )}

        {error !== null && (
          <GlobalError error={error} retry={retryLastAction} disabled={busy} />
        )}

        <ScrollArea className="min-h-0 flex-1" aria-label="Notes by section">
          <div className="space-y-5 px-4 pt-1 pb-36 pl-5">
            {view === "completed" ? (
              <CompletedView
                projections={projections}
                displayedIds={displayedIds}
                selection={visibleSelection}
                dispatchSelection={dispatchSelection}
                onOpenEditor={(noteId) => {
                  void window.kopper.openEditorWindow(noteId);
                }}
              />
            ) : (
              projections.map((projection) => (
                <SectionGroup
                  key={projection.section.id}
                  projection={projection}
                  view="active"
                  displayedIds={displayedIds}
                  selection={visibleSelection}
                  dispatchSelection={dispatchSelection}
                  captureHighlightedNoteId={captureHighlightedNoteId}
                  onExpand={(noteId) => {
                    void window.kopper.openEditorWindow(noteId);
                  }}
                  onEditNewWindow={(noteId) => {
                    void window.kopper.openEditorWindow(noteId);
                  }}
                />
              ))
            )}
            {projections.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No matching notes
              </p>
            )}
          </div>
        </ScrollArea>

        {view === "active" && <NoteComposer />}
      </Panel>
      <CaptureToast onHighlightedNoteChange={setCaptureHighlightedNoteId} />
    </div>
  );
}

export function App() {
  const { document, ready, error, pendingAction } = useKopperDocument();
  const editorNoteId = expandedEditorNoteId(globalThis.location.hash);

  if (pendingAction === "load") return <LoadingState />;
  if (!ready && error !== null) return <RecoveryScreen error={error} />;
  if (editorNoteId !== null) {
    return <ExpandedEditorWindow noteId={editorNoteId} />;
  }
  return (
    <AccessibilityPermissionGate
      renderPanel={(captureUnavailable) => (
        <DocumentPanel
          document={document}
          captureUnavailable={captureUnavailable}
        />
      )}
    />
  );
}
