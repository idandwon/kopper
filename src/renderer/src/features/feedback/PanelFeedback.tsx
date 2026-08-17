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
import {
  Toast,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "../../components/ui/toast";

const FEEDBACK_DURATION_MS = 1_800;

interface FeedbackNotice {
  id: number;
  message: string;
  tone: "status" | "error";
}

export interface PanelFeedbackValue {
  reportNotice(message: string, tone?: "status" | "error"): void;
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
  const noticeIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNoticeTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const reportNotice = useCallback(
    (message: string, tone: "status" | "error" = "status") => {
      clearNoticeTimer();
      noticeIdRef.current += 1;
      setNotice({ id: noticeIdRef.current, message, tone });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setNotice(null);
      }, FEEDBACK_DURATION_MS);
    },
    [clearNoticeTimer],
  );

  const dismissNotice = useCallback(() => {
    clearNoticeTimer();
    setNotice(null);
  }, [clearNoticeTimer]);

  const reportClipboardResult = useCallback(
    (result: ClipboardCopyResult) => {
      if (!result.ok) {
        reportNotice(result.error.message, "error");
        return;
      }

      const copiedCount = result.value.copiedCount;
      const message =
        copiedCount === 1 ? "Copied note." : `Copied ${copiedCount} notes.`;
      reportNotice(message);
    },
    [reportNotice],
  );

  const reportClipboardUnavailable = useCallback(() => {
    reportNotice("The selected notes could not be copied.", "error");
  }, [reportNotice]);

  const feedback = useMemo(
    () => ({ reportNotice, reportClipboardResult, reportClipboardUnavailable }),
    [reportNotice, reportClipboardResult, reportClipboardUnavailable],
  );

  useEffect(
    () => () => {
      clearNoticeTimer();
    },
    [clearNoticeTimer],
  );

  const errorNotice = notice?.tone === "error";

  return (
    <PanelFeedbackContext value={feedback}>
      <ToastProvider>
        {children}
        {notice === null ? null : (
          <Toast
            key={notice.id}
            open
            duration={Infinity}
            type={errorNotice ? "foreground" : "background"}
            role={errorNotice ? "alert" : "status"}
            aria-live="off"
            aria-atomic="true"
            className={errorNotice ? "border-destructive" : undefined}
            onOpenChange={(open) => {
              if (!open) dismissNotice();
            }}
          >
            <ToastTitle>{notice.message}</ToastTitle>
          </Toast>
        )}
        <ToastViewport />
      </ToastProvider>
    </PanelFeedbackContext>
  );
}
