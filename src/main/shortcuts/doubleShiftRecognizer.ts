export interface ModifierEvent {
  type: "down" | "up";
  key: "shift-left" | "shift-right" | "other";
  at: number;
}

const DOUBLE_TAP_WINDOW_MS = 400;

type ShiftKey = Exclude<ModifierEvent["key"], "other">;
type RecognitionState = "ready" | "cancelled" | "consumed";

export class DoubleShiftRecognizer {
  private readonly held = new Set<ShiftKey>();
  private readonly armed = new Set<ShiftKey>();
  private firstTapAt: number | null = null;
  private state: RecognitionState = "ready";
  private otherHeld = false;

  feed(event: ModifierEvent): "capture" | null {
    if (event.key === "other") {
      this.handleOther(event.type);
      return null;
    }

    if (event.type === "down") {
      return this.handleShiftDown(event.key);
    }
    return this.handleShiftUp(event.key, event.at);
  }

  reset(): void {
    this.held.clear();
    this.armed.clear();
    this.firstTapAt = null;
    this.state = "ready";
    this.otherHeld = false;
  }

  private handleShiftDown(key: ShiftKey): null {
    if (this.held.has(key)) return null;

    if (this.state === "consumed" && this.held.size === 0) {
      this.state = "ready";
    }

    if (this.held.size > 0) {
      this.held.add(key);
      this.armed.clear();
      this.firstTapAt = null;
      this.state = "cancelled";
      return null;
    }

    this.held.add(key);
    if (this.state === "ready") this.armed.add(key);
    return null;
  }

  private handleShiftUp(key: ShiftKey, at: number): "capture" | null {
    if (!this.held.delete(key)) return null;

    if (this.state !== "ready") {
      this.armed.delete(key);
      this.releaseCancellationIfAllKeysAreUp();
      return null;
    }

    if (!this.armed.delete(key)) return null;

    if (this.firstTapAt === null) {
      this.firstTapAt = at;
      return null;
    }

    const elapsed = at - this.firstTapAt;
    if (elapsed < 0 || elapsed > DOUBLE_TAP_WINDOW_MS) {
      this.firstTapAt = at;
      return null;
    }

    this.firstTapAt = null;
    this.state = "consumed";
    if (this.held.size === 0) this.state = "ready";
    return "capture";
  }

  private handleOther(type: ModifierEvent["type"]): void {
    if (type === "down") {
      this.otherHeld = true;
      this.cancelGesture();
      return;
    }

    if (!this.otherHeld) return;
    this.otherHeld = false;
    this.releaseCancellationIfAllKeysAreUp();
  }

  private cancelGesture(): void {
    this.armed.clear();
    this.firstTapAt = null;
    this.state =
      this.held.size > 0 || this.otherHeld ? "cancelled" : "ready";
  }

  private releaseCancellationIfAllKeysAreUp(): void {
    if (this.held.size === 0 && !this.otherHeld) this.state = "ready";
  }
}
