import type { PermissionState } from "../../shared/permissions/permissionState";

export interface PermissionChecker {
  check(prompt: boolean): PermissionState;
}

export type PermissionReconciler = (state: PermissionState) => Promise<void>;

export class PermissionObserver {
  private lastObservedState: PermissionState | undefined;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly permission: PermissionChecker,
    private readonly reconcile: PermissionReconciler,
    private readonly publish: (state: PermissionState) => void,
    private readonly reconciled?: (state: PermissionState) => void,
  ) {}

  observe(prompt: boolean): Promise<PermissionState> {
    const operation = this.tail.then(() => this.observeNow(prompt));
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async observeNow(prompt: boolean): Promise<PermissionState> {
    const state = this.permission.check(prompt);
    await this.reconcile(state);
    try {
      this.reconciled?.(state);
    } catch {
      // Permission truth and runtime state remain authoritative.
    }
    const previous = this.lastObservedState;
    this.lastObservedState = state;
    if (previous !== undefined && previous !== state) {
      try {
        this.publish(state);
      } catch {
        // A renderer publication failure cannot fail permission observation.
      }
    }
    return state;
  }
}
