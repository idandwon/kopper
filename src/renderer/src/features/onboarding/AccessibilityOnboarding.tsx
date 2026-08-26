import { useEffect, useRef, useState } from "react";

import type { PermissionState } from "../../../../shared/permissions/permissionState";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { PanelShell } from "../panel/PanelShell";

export interface AccessibilityOnboardingProps {
  permission: PermissionState | null;
  operationError: string | null;
  permissionEventVersion: number;
  checkPermission(prompt: boolean): Promise<void>;
  openSettings(): Promise<void>;
  continueWithoutCapture(): Promise<boolean>;
}

type PendingAction = "check" | "open-settings" | "continue" | null;

export function AccessibilityOnboarding({
  permission,
  operationError,
  permissionEventVersion,
  checkPermission,
  openSettings,
  continueWithoutCapture,
}: AccessibilityOnboardingProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mountedRef = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    setPendingAction((current) => (current === "check" ? null : current));
  }, [permissionEventVersion]);

  useEffect(() => {
    mountedRef.current = true;
    completedRef.current = permission === "granted";
    headingRef.current?.focus();

    return () => {
      mountedRef.current = false;
      completedRef.current = true;
    };
  }, [permission]);

  const runAction = async (
    action: Exclude<PendingAction, null>,
    operation: () => Promise<void>,
  ) => {
    setPendingAction(action);
    try {
      await operation();
    } finally {
      if (mountedRef.current && !completedRef.current) setPendingAction(null);
    }
  };

  const handleContinue = async () => {
    setPendingAction("continue");
    try {
      if (await continueWithoutCapture()) completedRef.current = true;
    } finally {
      if (mountedRef.current && !completedRef.current) setPendingAction(null);
    }
  };

  const restricted = permission === "restricted";
  const busy = pendingAction !== null;

  return (
    <PanelShell>
      <section
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        aria-labelledby="accessibility-heading"
        aria-busy={busy}
      >
        <ScrollArea
          data-scroll-owner="onboarding"
          className="min-h-0 min-w-0 flex-1"
          aria-label="Capture setup information"
        >
          <div className="flex min-h-full min-w-0 flex-col justify-center gap-5 px-6 pt-14 pb-6 pl-7">
            <div className="min-w-0 space-y-2">
              <p className="font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Capture setup
              </p>
              <h1
                id="accessibility-heading"
                ref={headingRef}
                tabIndex={-1}
                className="break-words text-xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Enable explicit text capture
              </h1>
              <p className="text-sm leading-6 text-card-foreground">
                Kopper needs Accessibility access to notice its shortcuts and
                copy text you explicitly capture.
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Kopper reads a selection only after you use your configured
                capture shortcut.
              </p>
            </div>

            <div className="min-w-0 rounded-lg border border-border bg-card p-3 text-sm text-card-foreground">
              <p className="m-0" role="status" aria-live="polite">
                {permission === null && "Checking Accessibility access…"}
                {permission === "unknown" &&
                  "Accessibility access has not been requested."}
                {permission === "granted" &&
                  "Accessibility access is enabled."}
                {permission === "denied" &&
                  "Accessibility access still needs approval."}
                {permission === "restricted" &&
                  "Capture is unavailable on this platform."}
              </p>
            </div>

            {permission === "denied" && (
              <div
                role="alert"
                className="min-w-0 rounded-lg border border-destructive bg-card p-3 text-sm text-card-foreground"
              >
                Accessibility access is not enabled. Grant access in System
                Settings, then check again. If Kopper already appears enabled,
                remove it with the minus button, add the current Kopper app
                again, then check again.
              </div>
            )}
            {operationError !== null && (
              <div
                role="alert"
                className="min-w-0 rounded-lg border border-destructive bg-card p-3 text-sm text-card-foreground"
              >
                {operationError}
              </div>
            )}
          </div>
        </ScrollArea>

        <footer className="min-w-0 shrink-0 border-t border-border px-6 pt-3 pb-6 pl-7">
          <div className="grid min-w-0 gap-2">
            <Button
              type="button"
              disabled={busy || restricted}
              onClick={() =>
                void runAction("check", () => checkPermission(true))
              }
            >
              Enable Capture
            </Button>
            <div
              data-onboarding-secondary-actions="true"
              className="grid min-w-0 grid-cols-1 gap-2 min-[380px]:grid-cols-2"
            >
              <Button
                type="button"
                variant="outline"
                disabled={busy || restricted}
                onClick={() =>
                  void runAction("open-settings", openSettings)
                }
              >
                Open System Settings
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runAction("check", () => checkPermission(false))
                }
              >
                Check again
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void handleContinue()}
            >
              Continue without capture
            </Button>
          </div>
        </footer>
      </section>
    </PanelShell>
  );
}
