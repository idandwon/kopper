import { useRef, useState } from "react";

import { useKopperDocument } from "../../app/DocumentProvider";
import { Button } from "../../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { usePanelFeedback } from "../feedback/PanelFeedback";
import { useNotesSurfaceOverlay } from "../notes/NotesSurfaceVisibility";
import { PinIcon } from "./PanelIcons";

export function PanelPinButton() {
  const { document, pendingAction } = useKopperDocument();
  const { dismissNotice, reportNotice } = usePanelFeedback();
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [pinRequestPending, setPinRequestPending] = useState(false);
  const pinRequestPendingRef = useRef(false);
  const pinErrorNoticeIdRef = useRef<number | null>(null);
  const tooltipOverlay = useNotesSurfaceOverlay(tooltipOpen, setTooltipOpen);
  const busy = pendingAction !== null || pinRequestPending;
  const pinned = document.window.pinned;
  const pinLabel = pinned ? "Unpin panel" : "Pin panel";

  const togglePinnedState = async () => {
    if (pendingAction !== null || pinRequestPendingRef.current) return;
    pinRequestPendingRef.current = true;
    setPinRequestPending(true);
    try {
      const result = await window.kopper.setPinned(!pinned);
      if (!result.ok) {
        pinErrorNoticeIdRef.current = reportNotice(
          result.error.message,
          "error",
        );
        return;
      }
      if (pinErrorNoticeIdRef.current !== null) {
        dismissNotice(pinErrorNoticeIdRef.current);
        pinErrorNoticeIdRef.current = null;
      }
    } catch {
      pinErrorNoticeIdRef.current = reportNotice(
        "The panel pin could not be changed.",
        "error",
      );
    } finally {
      pinRequestPendingRef.current = false;
      setPinRequestPending(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip {...tooltipOverlay}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={pinned ? "secondary" : "ghost"}
            size="icon"
            aria-label={pinLabel}
            aria-pressed={pinned}
            disabled={busy}
            onClick={() => void togglePinnedState()}
          >
            <PinIcon pinned={pinned} className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{pinLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
