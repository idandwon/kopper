import { useEffect, useRef } from "react";

import { Alert, AlertDescription } from "../../components/ui/alert";
import { DismissButton } from "../../components/ui/dismiss-button";
import { cn } from "../../lib/utils";

const STATUS_DURATION_MS = 1_800;
const ERROR_DURATION_MS = 4_000;

export interface SettingsFeedbackValue {
  text: string;
  tone: "status" | "error";
}

export function SettingsFeedback({
  value,
  className,
  persistent = false,
  onDismiss,
}: {
  value: SettingsFeedbackValue | null;
  className?: string;
  persistent?: boolean;
  onDismiss?(): void;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const dismissible = onDismiss !== undefined;

  useEffect(() => {
    if (value === null || persistent || !dismissible) return;
    const timer = setTimeout(
      () => dismissRef.current?.(),
      value.tone === "error" ? ERROR_DURATION_MS : STATUS_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [dismissible, persistent, value]);

  if (value === null) return null;

  return (
    <Alert
      role={value.tone === "error" ? "alert" : "status"}
      aria-live={value.tone === "status" ? "polite" : undefined}
      variant={value.tone === "error" ? "destructive" : "default"}
      className={cn(
        "flex min-w-0 items-center gap-2 py-2",
        className,
      )}
    >
      <AlertDescription className="min-w-0 flex-1 break-words">
        {value.text}
      </AlertDescription>
      {onDismiss === undefined ? null : (
        <DismissButton
          label="Dismiss message"
          onClick={onDismiss}
        />
      )}
    </Alert>
  );
}
