import type { KopperError, Result } from "../../shared/domain/errors";
import type { CaptureOutcome } from "../../shared/ipc/contract";
import type { PermissionState } from "../../shared/permissions/permissionState";

export interface CapturePermissionChecker {
  check(prompt: boolean): PermissionState;
}

export interface CaptureMonitor {
  start(): Result<void, KopperError>;
  stop(): void;
}

export type CaptureMonitorFactory = () => Promise<CaptureMonitor>;

const monitorError = (): KopperError => ({
  code: "permission_denied",
  message: "Kopper could not start global keyboard capture.",
  retryable: true,
  recoveryAction: "open_settings",
});

const monitorFailure = (): CaptureOutcome => ({
  status: "failed",
  error: monitorError(),
});

export class CaptureRuntime {
  private started = false;
  private disposed = false;
  private repositoryHealthy = true;
  private desiredState: PermissionState = "unknown";
  private observation = 0;
  private monitor: CaptureMonitor | undefined;
  private failurePublishedForGrantedCycle = false;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly permission: CapturePermissionChecker,
    private readonly createMonitor: CaptureMonitorFactory,
    private readonly publish: (outcome: CaptureOutcome) => void,
  ) {}

  async start(repositoryHealthy = true): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    this.repositoryHealthy = repositoryHealthy;
    if (!repositoryHealthy) {
      this.observation += 1;
      return;
    }
    await this.observeCurrentPermission();
  }

  async setRepositoryHealthy(healthy: boolean): Promise<void> {
    if (this.disposed || healthy === this.repositoryHealthy) return;
    this.repositoryHealthy = healthy;
    this.observation += 1;
    if (!healthy) {
      this.stopMonitor();
      return;
    }
    if (this.started) await this.observeCurrentPermission();
  }

  onPermissionObserved(state: PermissionState): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const stateChanged = state !== this.desiredState;
    this.desiredState = state;
    if (stateChanged) this.observation += 1;
    const observation = this.observation;
    const operation = this.tail.then(() =>
      this.reconcileObservedState(state, observation),
    );
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observation += 1;
    this.desiredState = "unknown";
    this.stopMonitor();
  }

  private async observeCurrentPermission(): Promise<void> {
    let state: PermissionState;
    try {
      state = this.permission.check(false);
    } catch {
      return;
    }
    await this.onPermissionObserved(state);
  }

  private async reconcileObservedState(
    state: PermissionState,
    observation: number,
  ): Promise<void> {
    if (this.disposed) return;
    if (state !== "granted") {
      this.failurePublishedForGrantedCycle = false;
      this.stopMonitor();
      return;
    }
    if (!this.isCurrentGrant(observation)) return;
    if (this.monitor !== undefined || this.failurePublishedForGrantedCycle) {
      return;
    }

    let monitor: CaptureMonitor;
    try {
      monitor = await this.createMonitor();
    } catch {
      if (this.isCurrentGrant(observation)) this.publishMonitorFailure();
      return;
    }

    if (!this.isCurrentGrant(observation)) {
      try {
        monitor.stop();
      } catch {
        // A superseded monitor is disposed without exposing native details.
      }
      return;
    }

    let result: Result<void, KopperError>;
    try {
      result = monitor.start();
    } catch {
      result = { ok: false, error: monitorError() };
    }
    if (!result.ok) {
      try {
        monitor.stop();
      } catch {
        // Failed native startup cleanup is best effort.
      }
      if (this.isCurrentGrant(observation)) this.publishMonitorFailure();
      return;
    }
    this.monitor = monitor;
  }

  private isCurrentGrant(observation: number): boolean {
    return (
      !this.disposed &&
      this.repositoryHealthy &&
      observation === this.observation &&
      this.desiredState === "granted"
    );
  }

  private publishMonitorFailure(): void {
    if (this.failurePublishedForGrantedCycle || this.disposed) return;
    this.failurePublishedForGrantedCycle = true;
    try {
      this.publish(monitorFailure());
    } catch {
      // Publication failures never create retry loops.
    }
  }

  private stopMonitor(): void {
    const monitor = this.monitor;
    this.monitor = undefined;
    if (monitor === undefined) return;
    try {
      monitor.stop();
    } catch {
      // Shutdown is best effort and never exposes native details.
    }
  }
}
