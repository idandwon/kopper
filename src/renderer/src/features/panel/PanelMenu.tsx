import { useEffect, useRef, useState } from "react";

import { useKopperDocument } from "../../app/DocumentProvider";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { AddSectionDialog } from "../sections/AddSectionDialog";
import { PanelMenuIcon } from "./PanelMenuIcon";
import {
  PanelSettingsSheet,
  type SettingsTab,
} from "./PanelSettingsSheet";

export function PanelMenu({
  captureUnavailable,
}: {
  captureUnavailable: boolean;
}) {
  const { document, pendingAction, undo } = useKopperDocument();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const busy = pendingAction !== null;

  useEffect(() => {
    return window.kopper.onOpenSettings(() => {
      setSettingsTab("shortcuts");
      setSettingsOpen(true);
    });
  }, []);

  const openAppearanceSettings = () => {
    setSettingsTab("appearance");
    setSettingsOpen(true);
  };

  const openSectionDialog = () => {
    setSectionDialogOpen(true);
  };

  const undoLastAction = () => {
    void undo();
  };

  const togglePinnedState = async () => {
    if (busy) return;
    const requestedPinnedState = !document.window.pinned;
    setStatusMessage("");
    try {
      const result = await window.kopper.setPinned(requestedPinnedState);
      if (!result.ok) {
        setStatusMessage(result.error.message);
        return;
      }
      setStatusMessage(
        result.value.window.pinned ? "Panel pinned." : "Panel unpinned.",
      );
    } catch {
      setStatusMessage("The panel pin could not be changed.");
    }
  };

  const restoreMenuFocus = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.focus();
  };

  const pinLabel = document.window.pinned ? "Unpin panel" : "Pin panel";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-10 rounded-lg border border-border bg-card"
            aria-label="Panel menu"
          >
            <PanelMenuIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={openSectionDialog}>
            Add section
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onSelect={undoLastAction}>
            Undo
            <DropdownMenuShortcut aria-hidden="true">⌘Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={busy}
            onSelect={() => void togglePinnedState()}
          >
            {pinLabel}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openAppearanceSettings}>
            Settings…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddSectionDialog
        mode="controlled"
        open={sectionDialogOpen}
        onOpenChange={setSectionDialogOpen}
      />

      <PanelSettingsSheet
        activeTab={settingsTab}
        captureUnavailable={captureUnavailable}
        open={settingsOpen}
        changeOpen={setSettingsOpen}
        changeTab={setSettingsTab}
        restoreMenuFocus={restoreMenuFocus}
      />

      {statusMessage.length > 0 ? (
        <p role="status" aria-live="polite" className="sr-only">
          {statusMessage}
        </p>
      ) : null}
    </>
  );
}
