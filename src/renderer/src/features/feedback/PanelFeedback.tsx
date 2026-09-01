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
  ToastClose,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "../../components/ui/toast";
import { DismissButton } from "../../components/ui/dismiss-button";

const FEEDBACK_DURATION_MS = 1_800;
const ERROR_FEEDBACK_DURATION_MS = 4_000;

interface FeedbackNotice {
  id: number;
  message: string;
  tone: "status" | "error";
}

export interface PanelFeedbackValue {
  reportNotice(message: string, tone?: "status" | "error"): number;
  dismissNotice(noticeId: number): void;
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
  const activeNoticeIdRef = useRef<number | null>(null);
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
      const noticeId = noticeIdRef.current;
      activeNoticeIdRef.current = noticeId;
      setNotice({ id: noticeId, message, tone });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (activeNoticeIdRef.current !== noticeId) return;
        activeNoticeIdRef.current = null;
        setNotice(null);
      }, tone === "error" ? ERROR_FEEDBACK_DURATION_MS : FEEDBACK_DURATION_MS);
      return noticeId;
    },
    [clearNoticeTimer],
  );

  const dismissNotice = useCallback((noticeId: number) => {
    if (activeNoticeIdRef.current !== noticeId) return;
    activeNoticeIdRef.current = null;
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
    () => ({
      reportNotice,
      dismissNotice,
      reportClipboardResult,
      reportClipboardUnavailable,
    }),
    [
      reportNotice,
      dismissNotice,
      reportClipboardResult,
      reportClipboardUnavailable,
    ],
  );

  useEffect(
    () => () => {
      activeNoticeIdRef.current = null;
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
              if (!open) dismissNotice(notice.id);
            }}
          >
            <ToastTitle>{notice.message}</ToastTitle>
            <ToastClose asChild>
              <DismissButton
                label="Dismiss notification"
                className="absolute top-2 right-2"
              />
            </ToastClose>
          </Toast>
        )}
        <ToastViewport />
      </ToastProvider>
    </PanelFeedbackContext>
  );
}
