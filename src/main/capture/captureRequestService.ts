import type { CaptureOutcome } from "../../shared/ipc/contract";
import type { PermissionState } from "../../shared/permissions/permissionState";

export interface CapturePermissionObserver {
  observe(prompt: boolean): Promise<PermissionState>;
}

export interface CaptureAvailability {
  isCaptureAvailable(): boolean;
}

export interface CaptureRequester {
  requestCapture(): Promise<CaptureOutcome>;
}

const unavailableCapture = (): CaptureOutcome => ({
  status: "failed",
  error: {
    code: "permission_denied",
    message: "Capture is unavailable until Accessibility access is granted.",
    retryable: true,
    recoveryAction: "open_settings",
  },
});

export class CaptureRequestService {
  constructor(
    private readonly permissionObserver: CapturePermissionObserver,
    private readonly runtime: CaptureAvailability,
    private readonly coordinator: CaptureRequester,
    private readonly publish: (outcome: CaptureOutcome) => void,
  ) {}

  async requestCapture(): Promise<CaptureOutcome> {
    let state: PermissionState;
    try {
      state = await this.permissionObserver.observe(false);
    } catch {
      return this.publishUnavailable();
    }
    if (state !== "granted" || !this.runtime.isCaptureAvailable()) {
      return this.publishUnavailable();
    }
    return this.coordinator.requestCapture();
  }

  private publishUnavailable(): CaptureOutcome {
    const outcome = unavailableCapture();
    try {
      this.publish(outcome);
    } catch {
      // Publication is best effort and cannot change capture availability.
    }
    return outcome;
  }
}
