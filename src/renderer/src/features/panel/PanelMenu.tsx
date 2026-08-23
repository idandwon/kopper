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
import { useNotesSurfaceOverlay } from "../notes/NotesSurfaceVisibility";
import { AddSectionDialog } from "../sections/AddSectionDialog";
import type { SettingsTab } from "../settings/settingsRoute";
import { VerticalOverflowIcon } from "./PanelIcons";

interface PanelMenuProps {
  openSettings(tab: SettingsTab): void;
  triggerRef: Ref<HTMLButtonElement>;
}

export function PanelMenu({ openSettings, triggerRef }: PanelMenuProps) {
  const { pendingAction, undo } = useKopperDocument();
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
                  <VerticalOverflowIcon className="size-4" />
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
