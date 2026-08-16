import { useCallback, useEffect, useRef, useState } from "react";

import type { PermissionState } from "../../../../shared/permissions/permissionState";
import { Button } from "../../components/ui/button";

export interface AccessibilityOnboardingProps {
  onGranted(): void;
  onContinueWithoutCapture(): void;
}

type PendingAction = "check" | "open-settings" | "continue" | null;

export function AccessibilityOnboarding({
  onGranted,
  onContinueWithoutCapture,
}: AccessibilityOnboardingProps) {
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mountedRef = useRef(false);
  const completedRef = useRef(false);
  const checkPendingRef = useRef(false);
  const requestIdRef = useRef(0);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current === null) return;
    window.clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const applyPermission = useCallback(
    (state: PermissionState, requestId?: number) => {
      if (
        !mountedRef.current ||
        completedRef.current ||
        (requestId !== undefined && requestId !== requestIdRef.current)
      ) {
        return;
      }
      setPermission(state);
      if (state === "granted") {
        completedRef.current = true;
        stopPolling();
        onGranted();
      }
    },
    [onGranted, stopPolling],
  );

  const checkPermission = useCallback(
    async (prompt: boolean, interactive: boolean) => {
      if (completedRef.current || (!interactive && checkPendingRef.current)) {
        return;
      }
      const requestId = ++requestIdRef.current;
      checkPendingRef.current = true;
      if (interactive && mountedRef.current) {
        setPendingAction("check");
        setOperationError(null);
      }

      try {
        const result = await window.kopper.getAccessibilityPermission(prompt);
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        if (result.ok) {
          applyPermission(result.value, requestId);
        } else {
          setOperationError(result.error.message);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          checkPendingRef.current = false;
          if (mountedRef.current && interactive) setPendingAction(null);
        }
      }
    },
    [applyPermission],
  );

  useEffect(() => {
    mountedRef.current = true;
    completedRef.current = false;
    checkPendingRef.current = false;
    headingRef.current?.focus();
    void checkPermission(false, false);
    pollRef.current = window.setInterval(() => {
      void checkPermission(false, false);
    }, 750);
    const unsubscribe = window.kopper.onAccessibilityPermissionChanged(
      (state) => {
        requestIdRef.current += 1;
        checkPendingRef.current = false;
        setPendingAction(null);
        applyPermission(state);
      },
    );

    return () => {
      mountedRef.current = false;
      completedRef.current = true;
      requestIdRef.current += 1;
      stopPolling();
      unsubscribe();
    };
  }, [applyPermission, checkPermission, stopPolling]);

  const openSettings = async () => {
    setPendingAction("open-settings");
    setOperationError(null);
    const result = await window.kopper.openAccessibilitySettings();
    if (!mountedRef.current || completedRef.current) return;
    if (!result.ok) setOperationError(result.error.message);
    setPendingAction(null);
  };

  const continueWithoutCapture = async () => {
    setPendingAction("continue");
    setOperationError(null);
    const result = await window.kopper.continueWithoutCapture();
    if (!mountedRef.current || completedRef.current) return;
    if (!result.ok) {
      setOperationError(result.error.message);
      setPendingAction(null);
      return;
    }
    completedRef.current = true;
    requestIdRef.current += 1;
    stopPolling();
    onContinueWithoutCapture();
  };

  const restricted = permission === "restricted";
  const busy = pendingAction !== null;

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[380px] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-background text-foreground">
      <div
        className="absolute inset-y-0 left-0 w-1 bg-[linear-gradient(to_bottom,var(--capture),var(--completed))]"
        aria-hidden="true"
      />
      <section
        className="flex flex-1 flex-col justify-center gap-5 px-6 py-8 pl-7"
        aria-labelledby="accessibility-heading"
        aria-busy={busy}
      >
        <div className="space-y-2">
          <p className="font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Capture setup
          </p>
          <h1
            id="accessibility-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Enable explicit text capture
          </h1>
          <p className="text-sm leading-6 text-card-foreground">
            Kopper needs Accessibility access to notice its shortcuts and copy
            text you explicitly capture.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            Kopper reads a selection only after you use your configured capture
            shortcut.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-3 text-sm text-card-foreground">
          <p className="m-0" role="status" aria-live="polite">
            {permission === null && "Checking Accessibility access…"}
            {permission === "unknown" &&
              "Accessibility access has not been requested."}
            {permission === "granted" && "Accessibility access is enabled."}
            {permission === "denied" &&
              "Accessibility access still needs approval."}
            {permission === "restricted" &&
              "Capture is unavailable on this platform."}
          </p>
        </div>

        {permission === "denied" && (
          <div
            role="alert"
            className="rounded-lg border border-destructive bg-card p-3 text-sm text-card-foreground"
          >
            Accessibility access is not enabled. Grant access in System
            Settings, then check again.
          </div>
        )}
        {operationError !== null && (
          <div
            role="alert"
            className="rounded-lg border border-destructive bg-card p-3 text-sm text-card-foreground"
          >
            {operationError}
          </div>
        )}

        <div className="grid gap-2">
          <Button
            type="button"
            disabled={busy || restricted}
            onClick={() => void checkPermission(true, true)}
          >
            Enable Capture
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || restricted}
              onClick={() => void openSettings()}
            >
              Open System Settings
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void checkPermission(false, true)}
            >
              Check again
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void continueWithoutCapture()}
          >
            Continue without capture
          </Button>
        </div>
      </section>
    </main>
  );
}
