import { useEffect, useRef, useState } from "react";

import type { CaptureOutcome } from "../../../../shared/ipc/contract";

export const CAPTURE_ACKNOWLEDGEMENT_MS = 1800;

export interface CaptureToastProps {
  onHighlightedNoteChange?(noteId: string | null): void;
}

function copyFor(outcome: CaptureOutcome): string {
  if (outcome.status === "captured") return "Captured";
  if (outcome.status === "empty") return "Nothing selected";
  switch (outcome.error.code) {
    case "capture_timeout":
      return "The source app did not provide text";
    case "permission_denied":
      return "Capture needs Accessibility access";
    case "write_failed":
      return "Captured text could not be saved";
    default:
      return "Kopper could not capture the selection.";
  }
}

export function CaptureToast({
  onHighlightedNoteChange,
}: CaptureToastProps) {
  const [outcome, setOutcome] = useState<CaptureOutcome | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const highlightListenerRef = useRef(onHighlightedNoteChange);
  highlightListenerRef.current = onHighlightedNoteChange;

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current === undefined) return;
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    };
    const unsubscribe = window.kopper.onCaptureOutcome((nextOutcome) => {
      clearTimer();
      setOutcome(nextOutcome);
      highlightListenerRef.current?.(
        nextOutcome.status === "captured" ? nextOutcome.noteId : null,
      );
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        setOutcome(null);
        highlightListenerRef.current?.(null);
      }, CAPTURE_ACKNOWLEDGEMENT_MS);
    });

    return () => {
      clearTimer();
      unsubscribe();
    };
  }, []);

  if (outcome === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed right-4 bottom-5 z-50 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg motion-safe:animate-[capture-toast_180ms_ease-out] motion-reduce:animate-[capture-toast-reduced_180ms_ease-out]"
    >
      {copyFor(outcome)}
    </div>
  );
}
