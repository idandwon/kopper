import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { PermissionState } from "../../../../shared/permissions/permissionState";
import { AccessibilityOnboarding } from "./AccessibilityOnboarding";

const CHECK_ERROR = "Kopper could not check Accessibility access.";
const SESSION_ERROR = "Kopper could not load the capture setup state.";
const SETTINGS_ERROR = "Kopper could not open Accessibility settings.";
const CONTINUE_ERROR = "Kopper could not continue without capture.";

export interface AccessibilityPermissionGateProps {
  renderPanel(captureUnavailable: boolean): ReactNode;
}

export function AccessibilityPermissionGate({
  renderPanel,
}: AccessibilityPermissionGateProps) {
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [initialCheckComplete, setInitialCheckComplete] = useState(false);
  const [permissionEventVersion, setPermissionEventVersion] = useState(0);
  const [panelEntered, setPanelEntered] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const passiveCheckPendingRef = useRef(false);

  const applyPermission = useCallback((state: PermissionState) => {
    if (!mountedRef.current) return;
    setPermission(state);
    setOperationError(null);
    if (state === "granted") setPanelEntered(true);
  }, []);

  const checkPermission = useCallback(
    async (prompt: boolean) => {
      if (!prompt && passiveCheckPendingRef.current) return;
      const requestId = ++requestIdRef.current;
      if (!prompt) passiveCheckPendingRef.current = true;
      try {
        const result = await window.kopper.getAccessibilityPermission(prompt);
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        if (result.ok) applyPermission(result.value);
        else setOperationError(CHECK_ERROR);
      } catch {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setOperationError(CHECK_ERROR);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          passiveCheckPendingRef.current = false;
        }
      }
    },
    [applyPermission],
  );

  const openSettings = useCallback(async () => {
    setOperationError(null);
    try {
      const result = await window.kopper.openAccessibilitySettings();
      if (!mountedRef.current) return;
      if (result.ok) setOperationError(null);
      else setOperationError(SETTINGS_ERROR);
    } catch {
      if (mountedRef.current) setOperationError(SETTINGS_ERROR);
    }
  }, []);

  const continueWithoutCapture = useCallback(async () => {
    setOperationError(null);
    try {
      const result = await window.kopper.continueWithoutCapture();
      if (!mountedRef.current) return false;
      if (!result.ok) {
        setOperationError(CONTINUE_ERROR);
        return false;
      }
      setOperationError(null);
      setPanelEntered(true);
      return true;
    } catch {
      if (mountedRef.current) setOperationError(CONTINUE_ERROR);
      return false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    let initialCheckStarted = false;

    const startInitialCheck = () => {
      if (
        initialCheckStarted ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      initialCheckStarted = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void checkPermission(false).finally(() => {
        if (active) setInitialCheckComplete(true);
      });
    };

    const handleVisibilityChange = () => startInitialCheck();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const unsubscribe = window.kopper.onAccessibilityPermissionChanged(
      (state) => {
        requestIdRef.current += 1;
        passiveCheckPendingRef.current = false;
        setPermissionEventVersion((version) => version + 1);
        applyPermission(state);
      },
    );

    void window.kopper
      .getAccessibilitySession()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          if (result.value.continuedWithoutCapture) setPanelEntered(true);
        } else {
          setOperationError(SESSION_ERROR);
        }
      })
      .catch(() => {
        if (active) setOperationError(SESSION_ERROR);
      })
      .finally(() => {
        if (active) setSessionLoaded(true);
      });

    startInitialCheck();

    return () => {
      active = false;
      mountedRef.current = false;
      requestIdRef.current += 1;
      passiveCheckPendingRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsubscribe();
    };
  }, [applyPermission, checkPermission]);

  if (!sessionLoaded || !initialCheckComplete) {
    return (
      <main className="flex h-dvh items-center justify-center bg-background text-foreground">
        <p role="status">Loading capture setup…</p>
      </main>
    );
  }

  if (panelEntered) {
    return renderPanel(permission !== "granted");
  }

  return (
    <AccessibilityOnboarding
      permission={permission}
      operationError={operationError}
      initialCheckComplete={initialCheckComplete}
      permissionEventVersion={permissionEventVersion}
      checkPermission={checkPermission}
      openSettings={openSettings}
      continueWithoutCapture={continueWithoutCapture}
    />
  );
}
