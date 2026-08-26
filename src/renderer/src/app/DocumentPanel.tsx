import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { KopperDocument } from "../../../shared/domain/document";
import type { KopperError } from "../../../shared/domain/errors";
import { Button } from "../components/ui/button";
import { DismissButton } from "../components/ui/dismiss-button";
import { Tabs, TabsContent } from "../components/ui/tabs";
import { CaptureToast } from "../features/capture/CaptureToast";
import { PanelFeedbackProvider } from "../features/feedback/PanelFeedback";
import { NoteCollection } from "../features/notes/NoteCollection";
import { NotePresentationProvider } from "../features/notes/NotePresentation";
import { NoteComposer } from "../features/notes/NoteComposer";
import { NotesSurfaceVisibilityProvider } from "../features/notes/NotesSurfaceVisibility";
import type { AccessibilityPermissionPanelControls } from "../features/onboarding/AccessibilityPermissionGate";
import { PanelHeader } from "../features/panel/PanelHeader";
import { PanelShell } from "../features/panel/PanelShell";
import { PanelShortcuts } from "../features/panel/PanelShortcuts";
import type { NoteProjectionView } from "../features/search/projectNotes";
import { SettingsPage } from "../features/settings/SettingsPage";
import type {
  PanelRoute,
  SettingsTab,
} from "../features/settings/settingsRoute";
import { useKopperDocument } from "./DocumentProvider";

interface DocumentErrorProps {
  error: KopperError;
  disabled: boolean;
  retry(): Promise<boolean>;
  dismiss(): void;
}

function DocumentError({ error, disabled, retry, dismiss }: DocumentErrorProps) {
  const retryAction = () => {
    void retry();
  };

  return (
    <div
      role="alert"
      className="mx-4 mb-2 flex items-center gap-3 rounded-lg border border-destructive bg-card p-3 text-sm text-card-foreground"
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
      <DismissButton label="Dismiss error" onClick={dismiss} />
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
      className="mx-4 mb-2 grid gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
    >
      <p role="status" aria-live="polite">
        {statusMessage}
      </p>
      <p>
        If Kopper already appears enabled, remove it with the minus button, add
        the current Kopper app again, then check again.
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
  const { clearError, error, pendingAction, retryLastAction, undo } =
    useKopperDocument();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<NoteProjectionView>("active");
  const [route, setRoute] = useState<PanelRoute>({ page: "notes" });
  const [settingsFocusRequest, setSettingsFocusRequest] = useState(0);
  const [selectAllRequests, setSelectAllRequests] = useState<
    Record<NoteProjectionView, number>
  >({ active: 0, completed: 0 });
  const [captureHighlightedNoteId, setCaptureHighlightedNoteId] = useState<
    string | null
  >(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const pendingReturnFocusRef = useRef<"menu" | "search" | null>(null);
  const busy = pendingAction !== null;

  const openSettingsFromMenu = useCallback((tab: SettingsTab) => {
    setRoute({ page: "settings", tab, returnFocus: "menu" });
  }, []);

  const openSettingsFromNativeEvent = useCallback(() => {
    setSettingsFocusRequest((request) => request + 1);
    setRoute({
      page: "settings",
      tab: "shortcuts",
      returnFocus: "search",
    });
  }, []);

  useEffect(
    () => window.kopper.onOpenSettings(openSettingsFromNativeEvent),
    [openSettingsFromNativeEvent],
  );

  const changeSettingsTab = useCallback((tab: SettingsTab) => {
    setRoute((currentRoute) =>
      currentRoute.page === "settings"
        ? { ...currentRoute, tab }
        : currentRoute,
    );
  }, []);

  const closeSettings = useCallback(() => {
    if (route.page !== "settings") return;
    pendingReturnFocusRef.current = route.returnFocus;
    setRoute({ page: "notes" });
  }, [route]);

  useLayoutEffect(() => {
    if (route.page !== "notes") return;
    const returnFocus = pendingReturnFocusRef.current;
    if (returnFocus === null) return;
    pendingReturnFocusRef.current = null;
    if (returnFocus === "menu") {
      menuTriggerRef.current?.focus();
      return;
    }
    searchInputRef.current?.focus();
  }, [route.page]);

  const focusSearch = () => {
    searchInputRef.current?.focus();
  };

  const undoLastAction = () => {
    void undo();
  };

  const selectAllNotes = () => {
    setSelectAllRequests((requests) => ({
      ...requests,
      [view]: requests[view] + 1,
    }));
  };

  const changeView = (nextView: string) => {
    if (nextView === "active" || nextView === "completed") {
      setView(nextView);
    }
  };

  return (
    <PanelFeedbackProvider>
      <NotePresentationProvider>
        <NotesSurfaceVisibilityProvider visible={route.page === "notes"}>
          <div className="contents">
            <PanelShell>
              <div
                data-panel-surface="notes"
                hidden={route.page !== "notes"}
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              >
                <Tabs
                  value={view}
                  onValueChange={changeView}
                  className="contents"
                >
                  <PanelHeader
                    query={query}
                    searchInputRef={searchInputRef}
                    menuTriggerRef={menuTriggerRef}
                    changeQuery={setQuery}
                    openSettings={openSettingsFromMenu}
                  />

                  {captureUnavailable ? (
                    <CaptureAccessPanel controls={permissionControls} />
                  ) : null}

                  {error === null ? null : (
                    <DocumentError
                      error={error}
                      retry={retryLastAction}
                      disabled={busy}
                      dismiss={clearError}
                    />
                  )}

                  <TabsContent
                    value="active"
                    forceMount
                    hidden={view !== "active"}
                    className="mt-0 min-h-0 min-w-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
                  >
                    <NoteCollection
                      active={view === "active"}
                      document={document}
                      query={query}
                      view="active"
                      captureHighlightedNoteId={captureHighlightedNoteId}
                      selectAllRequest={selectAllRequests.active}
                    />
                    <NoteComposer />
                  </TabsContent>

                  <TabsContent
                    value="completed"
                    forceMount
                    hidden={view !== "completed"}
                    className="mt-0 min-h-0 min-w-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
                  >
                    <NoteCollection
                      active={view === "completed"}
                      document={document}
                      query={query}
                      view="completed"
                      captureHighlightedNoteId={null}
                      selectAllRequest={selectAllRequests.completed}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {route.page === "settings" ? (
                <SettingsPage
                  activeTab={route.tab}
                  captureUnavailable={captureUnavailable}
                  focusRequest={settingsFocusRequest}
                  changeTab={changeSettingsTab}
                  closeSettings={closeSettings}
                />
              ) : null}

              <PanelShortcuts
                disabled={busy}
                enabled={route.page === "notes"}
                focusSearch={focusSearch}
                selectAllNotes={selectAllNotes}
                undo={undoLastAction}
              />
            </PanelShell>
            <CaptureToast
              displayNotice={false}
              onHighlightedNoteChange={setCaptureHighlightedNoteId}
            />
          </div>
        </NotesSurfaceVisibilityProvider>
      </NotePresentationProvider>
    </PanelFeedbackProvider>
  );
}
