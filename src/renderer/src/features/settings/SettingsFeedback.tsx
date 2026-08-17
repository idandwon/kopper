import { cn } from "../../lib/utils";

export interface SettingsFeedbackValue {
  text: string;
  tone: "status" | "error";
}

export function SettingsFeedback({
  value,
  className,
}: {
  value: SettingsFeedbackValue | null;
  className?: string;
}) {
  if (value === null) return null;

  return (
    <p
      role={value.tone === "error" ? "alert" : "status"}
      aria-live={value.tone === "status" ? "polite" : undefined}
      className={cn(
        "m-0 min-w-0 break-words text-xs",
        className,
        value.tone === "error" && "text-destructive",
      )}
    >
      {value.text}
    </p>
  );
}
