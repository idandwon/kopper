import { useEffect, useRef } from "react";

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
    <div
      className={cn(
        "flex min-w-0 items-start gap-1 text-xs",
        className,
        value.tone === "error" && "text-destructive",
      )}
    >
      <p
        role={value.tone === "error" ? "alert" : "status"}
        aria-live={value.tone === "status" ? "polite" : undefined}
        className="m-0 min-w-0 flex-1 break-words"
      >
        {value.text}
      </p>
      {onDismiss === undefined ? null : (
        <DismissButton
          label="Dismiss message"
          className="-mt-1 -mr-1"
          onClick={onDismiss}
        />
      )}
    </div>
  );
}
