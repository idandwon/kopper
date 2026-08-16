export interface BeforeQuitEvent {
  preventDefault(): void;
}

export interface ControlledQuitOptions {
  flushBounds(): void | Promise<void>;
  disposeCaptureRuntime(): void | Promise<void>;
  disposeShortcutManager(): void | Promise<void>;
  disposeSecurityPolicy(): void | Promise<void>;
  finishQuit(): void;
}

async function settle(operation: () => void | Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    // Controlled shutdown continues after fixed, best-effort cleanup failures.
  }
}

export class ControlledQuit {
  private isQuitting = false;
  private shutdown: Promise<void> | undefined;

  constructor(private readonly options: ControlledQuitOptions) {}

  handleBeforeQuit(event: BeforeQuitEvent): void {
    if (this.isQuitting) return;
    event.preventDefault();
    this.shutdown ??= this.completeShutdown();
  }

  private async completeShutdown(): Promise<void> {
    await settle(() => this.options.flushBounds());
    await settle(() => this.options.disposeCaptureRuntime());
    await settle(() => this.options.disposeShortcutManager());
    await settle(() => this.options.disposeSecurityPolicy());
    this.isQuitting = true;
    this.options.finishQuit();
  }
}
