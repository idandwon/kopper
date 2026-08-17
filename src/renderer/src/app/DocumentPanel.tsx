import { useState } from "react";

import type { KopperDocument } from "../../../shared/domain/document";
import type { KopperError } from "../../../shared/domain/errors";
import { Button } from "../components/ui/button";
import { CaptureToast } from "../features/capture/CaptureToast";
import { PanelFeedbackProvider } from "../features/feedback/PanelFeedback";
import { NoteCollection } from "../features/notes/NoteCollection";
import { NotePresentationProvider } from "../features/notes/NotePresentation";
import { NoteComposer } from "../features/notes/NoteComposer";
import type { AccessibilityPermissionPanelControls } from "../features/onboarding/AccessibilityPermissionGate";
import { PanelHeader } from "../features/panel/PanelHeader";
import { PanelShell } from "../features/panel/PanelShell";
import type { NoteProjectionView } from "../features/search/projectNotes";
import { useKopperDocument } from "./DocumentProvider";

interface DocumentErrorProps {
  error: KopperError;
  disabled: boolean;
  retry(): Promise<boolean>;
}

function DocumentError({ error, disabled, retry }: DocumentErrorProps) {
  const retryAction = () => {
    void retry();
  };

  return (
    <div
      role="alert"
      className="mx-4 mb-2 ml-5 flex items-center gap-3 rounded-lg border border-destructive bg-card p-3 text-sm text-card-foreground"
    >
      <p className="m-0 min-w-0 flex-1">{error.message}</p>
      {error.retryable ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={retryAction}
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function CaptureAccessPanel({
  controls,
}: {
  controls: AccessibilityPermissionPanelControls;
}) {
  const checkingAccess = controls.pendingAction === "check";
  const openingSettings = controls.pendingAction === "open-settings";
  const statusMessage = checkingAccess
    ? "Checking Accessibility access…"
    : openingSettings
      ? "Opening System Settings…"
      : "Capture unavailable — Accessibility access has not been granted.";
  const busy = controls.pendingAction !== null;

  const openSettings = () => {
    void controls.openSettings();
  };

  const checkAccess = () => {
    void controls.checkAccess();
  };

  return (
    <section
      aria-label="Capture access"
      aria-busy={busy}
      className="mx-4 mb-2 ml-5 grid gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
    >
      <p role="status" aria-live="polite">
        {statusMessage}
      </p>
      {controls.operationError === null ? null : (
        <p role="alert">{controls.operationError}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={openSettings}
        >
          Open System Settings
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={checkAccess}
        >
          Check access
        </Button>
      </div>
    </section>
  );
}

interface DocumentPanelProps {
  document: KopperDocument;
  captureUnavailable: boolean;
  permissionControls: AccessibilityPermissionPanelControls;
}

export function DocumentPanel({
  document,
  captureUnavailable,
  permissionControls,
}: DocumentPanelProps) {
  const { error, pendingAction, retryLastAction } = useKopperDocument();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<NoteProjectionView>("active");
  const [captureHighlightedNoteId, setCaptureHighlightedNoteId] = useState<
    string | null
  >(null);
  const busy = pendingAction !== null;

  return (
    <PanelFeedbackProvider>
      <NotePresentationProvider>
        <div className="contents">
          <PanelShell>
            <PanelHeader
              query={query}
              view={view}
              captureUnavailable={captureUnavailable}
              changeQuery={setQuery}
              changeView={setView}
            />

            {captureUnavailable ? (
              <CaptureAccessPanel controls={permissionControls} />
            ) : null}

            {error === null ? null : (
              <DocumentError
                error={error}
                retry={retryLastAction}
                disabled={busy}
              />
            )}

            <NoteCollection
              document={document}
              query={query}
              view={view}
              captureHighlightedNoteId={captureHighlightedNoteId}
            />

            {view === "active" ? <NoteComposer /> : null}
          </PanelShell>
          <CaptureToast
            displayNotice={false}
            onHighlightedNoteChange={setCaptureHighlightedNoteId}
          />
        </div>
      </NotePresentationProvider>
    </PanelFeedbackProvider>
  );
}
