import { useState, type Ref } from "react";

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
import { usePanelFeedback } from "../feedback/PanelFeedback";
import { useNotesSurfaceOverlay } from "../notes/NotesSurfaceVisibility";
import { AddSectionDialog } from "../sections/AddSectionDialog";
import type { SettingsTab } from "../settings/settingsRoute";
import { PanelMenuIcon } from "./PanelMenuIcon";

interface PanelMenuProps {
  openSettings(tab: SettingsTab): void;
  triggerRef: Ref<HTMLButtonElement>;
}

export function PanelMenu({ openSettings, triggerRef }: PanelMenuProps) {
  const { document, pendingAction, undo } = useKopperDocument();
  const { reportNotice } = usePanelFeedback();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const menuOverlay = useNotesSurfaceOverlay(menuOpen, setMenuOpen);
  const tooltipOverlay = useNotesSurfaceOverlay(tooltipOpen, setTooltipOpen);
  const busy = pendingAction !== null;

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
    try {
      const result = await window.kopper.setPinned(requestedPinnedState);
      if (!result.ok) {
        reportNotice(result.error.message, "error");
        return;
      }
      reportNotice(
        result.value.window.pinned ? "Panel pinned." : "Panel unpinned.",
      );
    } catch {
      reportNotice("The panel pin could not be changed.", "error");
    }
  };

  const pinLabel = document.window.pinned ? "Unpin panel" : "Pin panel";

  return (
    <>
      <DropdownMenu {...menuOverlay}>
        <TooltipProvider>
          <Tooltip {...tooltipOverlay}>
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
        open={sectionDialogOpen}
        onOpenChange={setSectionDialogOpen}
      />
    </>
  );
}
