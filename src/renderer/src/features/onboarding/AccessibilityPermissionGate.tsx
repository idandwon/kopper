import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { PermissionState } from "../../../../shared/permissions/permissionState";
import { LoadingPanel } from "../panel/PanelShell";
import { AccessibilityOnboarding } from "./AccessibilityOnboarding";

const CHECK_ERROR = "Kopper could not check Accessibility access.";
const REPAIR_ERROR = "Kopper could not repair Accessibility access.";
const SESSION_ERROR = "Kopper could not load the capture setup state.";
const SETTINGS_ERROR = "Kopper could not open Accessibility settings.";
const CONTINUE_ERROR = "Kopper could not continue without capture.";

export type PermissionPanelPendingAction = "repair" | "open-settings" | null;

export interface AccessibilityPermissionPanelControls {
  permission: PermissionState | null;
  operationError: string | null;
  pendingAction: PermissionPanelPendingAction;
  repairAccess(): Promise<void>;
  openSettings(): Promise<void>;
}

export interface AccessibilityPermissionGateProps {
  renderPanel(
    captureUnavailable: boolean,
    controls: AccessibilityPermissionPanelControls,
  ): ReactNode;
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
  const [panelPendingAction, setPanelPendingAction] =
    useState<PermissionPanelPendingAction>(null);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const repairRequestIdRef = useRef(0);
  const permissionEventVersionRef = useRef(0);
  const passiveCheckPendingRef = useRef(false);

  const applyPermission = useCallback((state: PermissionState) => {
    if (!mountedRef.current) return;
    setPermission(state);
    setOperationError(null);
    if (state === "granted") setPanelEntered(true);
  }, []);

  const invalidatePassiveCheck = useCallback(() => {
    if (!passiveCheckPendingRef.current) return;
    requestIdRef.current += 1;
    passiveCheckPendingRef.current = false;
  }, []);

  const checkPermission = useCallback(
    async (
      prompt: boolean,
      replacePendingPassive = false,
    ): Promise<PermissionState | null> => {
      if (
        !prompt &&
        passiveCheckPendingRef.current &&
        !replacePendingPassive
      ) {
        return null;
      }
      const requestId = ++requestIdRef.current;
      if (prompt) passiveCheckPendingRef.current = false;
      else passiveCheckPendingRef.current = true;
      try {
        const result = await window.kopper.getAccessibilityPermission(prompt);
        if (!mountedRef.current || requestId !== requestIdRef.current) return null;
        if (result.ok) {
          applyPermission(result.value);
          return result.value;
        }
        setOperationError(CHECK_ERROR);
      } catch {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setOperationError(CHECK_ERROR);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          passiveCheckPendingRef.current = false;
        }
      }
      return null;
    },
    [applyPermission],
  );

  useEffect(() => {
    setPanelPendingAction((current) =>
      current === "repair" ? null : current,
    );
  }, [permissionEventVersion]);

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

  const repairAccess = useCallback(async () => {
    if (panelPendingAction !== null) return;
    invalidatePassiveCheck();
    const repairRequestId = ++repairRequestIdRef.current;
    const eventVersionAtStart = permissionEventVersionRef.current;
    setOperationError(null);
    setPanelPendingAction("repair");
    try {
      const result = await window.kopper.repairAccessibilityPermission();
      if (
        !mountedRef.current ||
        repairRequestId !== repairRequestIdRef.current
      ) {
        return;
      }
      if (result.ok) {
        if (eventVersionAtStart === permissionEventVersionRef.current) {
          applyPermission(result.value);
        }
      } else {
        setOperationError(result.error.message);
      }
    } catch {
      if (
        mountedRef.current &&
        repairRequestId === repairRequestIdRef.current
      ) {
        setOperationError(REPAIR_ERROR);
      }
    } finally {
      if (
        mountedRef.current &&
        repairRequestId === repairRequestIdRef.current
      ) {
        setPanelPendingAction(null);
      }
    }
  }, [applyPermission, invalidatePassiveCheck, panelPendingAction]);

  const openPanelSettings = useCallback(async () => {
    if (panelPendingAction !== null) return;
    setPanelPendingAction("open-settings");
    try {
      await openSettings();
    } finally {
      if (mountedRef.current) setPanelPendingAction(null);
    }
  }, [openSettings, panelPendingAction]);

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
    let initialCheckSettled = false;
    let initialCheckPending = false;
    let initialAttempt = 0;

    const startInitialCheck = (replacePending = false) => {
      if (
        initialCheckSettled ||
        document.visibilityState !== "visible" ||
        (initialCheckPending && !replacePending)
      ) {
        return;
      }
      initialCheckPending = true;
      const attempt = ++initialAttempt;
      void checkPermission(false, replacePending).finally(() => {
        if (!active || attempt !== initialAttempt) return;
        initialCheckPending = false;
        initialCheckSettled = true;
        setInitialCheckComplete(true);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        initialAttempt += 1;
        initialCheckPending = false;
        invalidatePassiveCheck();
        return;
      }
      startInitialCheck(true);
    };
    const handleWindowFocus = () => {
      if (document.visibilityState !== "visible") return;
      void checkPermission(false, true);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    const unsubscribe = window.kopper.onAccessibilityPermissionChanged(
      (state) => {
        requestIdRef.current += 1;
        permissionEventVersionRef.current += 1;
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
      repairRequestIdRef.current += 1;
      passiveCheckPendingRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      unsubscribe();
    };
  }, [applyPermission, checkPermission, invalidatePassiveCheck]);

  useEffect(() => {
    if (
      !sessionLoaded ||
      !initialCheckComplete ||
      panelEntered ||
      permission === "granted"
    ) {
      return;
    }

    let active = true;
    let intervalId: number | undefined;
    const stopPolling = () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
      intervalId = undefined;
    };
    const startPolling = () => {
      stopPolling();
      if (!active || document.visibilityState !== "visible") return;
      intervalId = window.setInterval(() => {
        void checkPermission(false);
      }, 750);
    };
    const handleVisibilityChange = () => {
      stopPolling();
      if (document.visibilityState !== "visible") {
        invalidatePassiveCheck();
        return;
      }
      void checkPermission(false, true).then((state) => {
        if (state !== "granted") startPolling();
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    startPolling();
    return () => {
      active = false;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    checkPermission,
    initialCheckComplete,
    panelEntered,
    permission,
    sessionLoaded,
    invalidatePassiveCheck,
  ]);

  if (!sessionLoaded || !initialCheckComplete) {
    return <LoadingPanel label="Loading capture setup" />;
  }

  if (panelEntered) {
    return renderPanel(permission !== "granted", {
      permission,
      operationError,
      pendingAction: panelPendingAction,
      repairAccess,
      openSettings: openPanelSettings,
    });
  }

  return (
    <AccessibilityOnboarding
      permission={permission}
      operationError={operationError}
      permissionEventVersion={permissionEventVersion}
      repairAccess={repairAccess}
      openSettings={openSettings}
      continueWithoutCapture={continueWithoutCapture}
    />
  );
}
