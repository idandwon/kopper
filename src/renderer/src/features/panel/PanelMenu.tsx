import { useEffect, useState, type Ref } from "react";

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { AddSectionDialog } from "../sections/AddSectionDialog";
import type { SettingsTab } from "../settings/settingsRoute";
import { PanelMenuIcon } from "./PanelMenuIcon";

interface PanelMenuProps {
  notesVisible: boolean;
  openSettings(tab: SettingsTab): void;
  triggerRef: Ref<HTMLButtonElement>;
}

export function PanelMenu({
  notesVisible,
  openSettings,
  triggerRef,
}: PanelMenuProps) {
  const { document, pendingAction, undo } = useKopperDocument();
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const busy = pendingAction !== null;

  useEffect(() => {
    if (!notesVisible) setSectionDialogOpen(false);
  }, [notesVisible]);

  const openAppearanceSettings = () => {
    openSettings("appearance");
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

  const pinLabel = document.window.pinned ? "Unpin panel" : "Pin panel";

  return (
    <>
      <DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent>Panel menu</TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
        open={notesVisible && sectionDialogOpen}
        onOpenChange={setSectionDialogOpen}
      />

      {statusMessage.length > 0 ? (
        <p role="status" aria-live="polite" className="sr-only">
          {statusMessage}
        </p>
      ) : null}
    </>
  );
}
