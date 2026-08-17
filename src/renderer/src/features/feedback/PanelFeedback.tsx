import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ClipboardCopyResult } from "../../../../shared/ipc/contract";

const FEEDBACK_DURATION_MS = 1_800;

interface FeedbackNotice {
  message: string;
  tone: "status" | "error";
}

interface PanelFeedbackValue {
  reportClipboardResult(result: ClipboardCopyResult): void;
  reportClipboardUnavailable(): void;
}

const PanelFeedbackContext = createContext<PanelFeedbackValue | null>(null);

export function usePanelFeedback(): PanelFeedbackValue {
  const feedback = useContext(PanelFeedbackContext);
  if (feedback === null) {
    throw new Error("Panel feedback requires PanelFeedbackProvider.");
  }
  return feedback;
}

export function PanelFeedbackProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<FeedbackNotice | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((nextNotice: FeedbackNotice) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setNotice(nextNotice);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setNotice(null);
    }, FEEDBACK_DURATION_MS);
  }, []);

  const reportClipboardResult = useCallback(
    (result: ClipboardCopyResult) => {
      if (!result.ok) {
        showNotice({ message: result.error.message, tone: "error" });
        return;
      }

      const copiedCount = result.value.copiedCount;
      const message =
        copiedCount === 1 ? "Copied note." : `Copied ${copiedCount} notes.`;
      showNotice({ message, tone: "status" });
    },
    [showNotice],
  );

  const reportClipboardUnavailable = useCallback(() => {
    showNotice({
      message: "The selected notes could not be copied.",
      tone: "error",
    });
  }, [showNotice]);

  const feedback = useMemo(
    () => ({ reportClipboardResult, reportClipboardUnavailable }),
    [reportClipboardResult, reportClipboardUnavailable],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <PanelFeedbackContext value={feedback}>
      {children}
      {notice === null ? null : notice.tone === "error" ? (
        <div
          role="alert"
          className="pointer-events-none fixed right-4 bottom-5 z-50 max-w-[calc(100%-2rem)] rounded-lg border border-destructive bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
        >
          {notice.message}
        </div>
      ) : (
        <p role="status" aria-live="polite" className="sr-only">
          {notice.message}
        </p>
      )}
    </PanelFeedbackContext>
  );
}
