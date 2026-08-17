import { screen, type BrowserWindow } from "electron";

import type { CaptureOutcome } from "../../shared/ipc/contract";
import { IPC_CHANNELS } from "../../shared/ipc/contract";
import { loadRenderer } from "./loadRenderer";

const HUD_WIDTH = 340;
const HUD_HEIGHT = 72;
const HUD_BOTTOM_INSET = 48;
const HUD_DURATION_MS = 1_800;

interface CaptureHudWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CaptureHudOptions {
  rendererUrl: URL;
  anchorBounds(): CaptureHudWindowBounds | undefined;
  createWindow(bounds: CaptureHudWindowBounds): BrowserWindow;
  windowCreated(window: BrowserWindow): void;
}

export class CaptureHud {
  private window: BrowserWindow | undefined;
  private ready = false;
  private pendingOutcome: CaptureOutcome | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: CaptureHudOptions) {}

  show(outcome: CaptureOutcome): void {
    this.pendingOutcome = structuredClone(outcome);
    const existingWindow = this.getWindow();
    const window = existingWindow ?? this.createWindow();
    if (existingWindow !== undefined) window.setBounds(this.currentBounds());
    if (!this.ready) return;
    this.present(window);
  }

  getWindow(): BrowserWindow | undefined {
    const window = this.window;
    if (window === undefined || window.isDestroyed()) return undefined;
    return window;
  }

  dispose(): void {
    this.clearTimer();
    this.pendingOutcome = null;
    const window = this.getWindow();
    if (window !== undefined) window.destroy();
    this.window = undefined;
    this.ready = false;
  }

  private createWindow(): BrowserWindow {
    const existing = this.getWindow();
    if (existing !== undefined) return existing;

    const window = this.options.createWindow(this.currentBounds());
    this.window = window;
    this.ready = false;
    this.options.windowCreated(window);
    window.setIgnoreMouseEvents(true);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    loadRenderer(window, this.options.rendererUrl, "capture-hud");
    window.once("ready-to-show", () => {
      this.ready = true;
      this.present(window);
    });
    window.once("closed", () => {
      if (this.window !== window) return;
      this.clearTimer();
      this.window = undefined;
      this.ready = false;
    });
    return window;
  }

  private currentBounds(): CaptureHudWindowBounds {
    const anchorBounds = this.options.anchorBounds();
    if (anchorBounds !== undefined) {
      return {
        x: anchorBounds.x + anchorBounds.width - HUD_WIDTH,
        y: anchorBounds.y + anchorBounds.height - HUD_HEIGHT,
        width: HUD_WIDTH,
        height: HUD_HEIGHT,
      };
    }

    const workArea = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    ).workArea;
    return {
      x: Math.round(workArea.x + (workArea.width - HUD_WIDTH) / 2),
      y: workArea.y + workArea.height - HUD_HEIGHT - HUD_BOTTOM_INSET,
      width: HUD_WIDTH,
      height: HUD_HEIGHT,
    };
  }

  private present(window: BrowserWindow): void {
    const outcome = this.pendingOutcome;
    if (outcome === null || window.isDestroyed()) return;
    this.pendingOutcome = null;
    window.webContents.send(IPC_CHANNELS.captureOutcome, outcome);
    window.showInactive();
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!window.isDestroyed()) window.hide();
    }, HUD_DURATION_MS);
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
