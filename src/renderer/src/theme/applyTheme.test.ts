import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OXIDE_LEDGER_THEME } from "../../../shared/theme/presets";
import type { CompleteThemeMode } from "../../../shared/theme/themeSchema";
import { applyTheme } from "./applyTheme";

interface QueuedFrame {
  id: number;
  callback: FrameRequestCallback;
  cancelled: boolean;
}

let frames: QueuedFrame[];
let nextFrameId: number;

function flushFrames({ includeCancelled = false } = {}): void {
  const queued = frames;
  frames = [];
  for (const frame of queued) {
    if (includeCancelled || !frame.cancelled) frame.callback(0);
  }
}

beforeEach(() => {
  frames = [];
  nextFrameId = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const frame = { id: nextFrameId++, callback, cancelled: false };
    frames.push(frame);
    return frame.id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const frame = frames.find((candidate) => candidate.id === id);
    if (frame !== undefined) frame.cancelled = true;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("applyTheme", () => {
  it("applies only the explicit canonical property map in one frame", () => {
    const root = document.createElement("html");
    root.style.setProperty("--background", "stale");
    root.style.setProperty("--organized", "stale");
    const mode = {
      ...OXIDE_LEDGER_THEME.light,
      background: "rgb(1 2 3)",
      radius: "1.25rem",
      injected: "red",
    } as CompleteThemeMode & { injected: string };

    applyTheme(root, mode);

    expect(root.style.getPropertyValue("--background")).toBe("stale");
    flushFrames();
    expect(root.style.getPropertyValue("--background")).toBe("rgb(1 2 3)");
    expect(root.style.getPropertyValue("--organized")).toBe(mode.organized);
    expect(root.style.getPropertyValue("--radius")).toBe("1.25rem");
    expect(root.style.getPropertyValue("--injected")).toBe("");
  });

  it("restores exact previous inline values and priorities on cleanup", () => {
    const root = document.createElement("html");
    root.style.setProperty("--background", "previous", "important");
    root.style.setProperty("--capture", "prior-capture");
    root.style.setProperty("--unrelated", "untouched");

    const cleanup = applyTheme(root, OXIDE_LEDGER_THEME.dark);
    flushFrames();
    expect(root.style.getPropertyValue("--background")).toBe(
      OXIDE_LEDGER_THEME.dark.background,
    );

    cleanup();
    expect(root.style.getPropertyValue("--background")).toBe("previous");
    expect(root.style.getPropertyPriority("--background")).toBe("important");
    expect(root.style.getPropertyValue("--capture")).toBe("prior-capture");
    expect(root.style.getPropertyValue("--radius")).toBe("");
    expect(root.style.getPropertyValue("--unrelated")).toBe("untouched");
  });

  it("cancels cleanup-before-frame and prevents replaced frames from applying late", () => {
    const root = document.createElement("html");
    root.style.setProperty("--background", "original");

    const cleanupBeforeFrame = applyTheme(root, OXIDE_LEDGER_THEME.light);
    cleanupBeforeFrame();
    flushFrames({ includeCancelled: true });
    expect(root.style.getPropertyValue("--background")).toBe("original");

    const firstCleanup = applyTheme(root, OXIDE_LEDGER_THEME.light);
    firstCleanup();
    const secondCleanup = applyTheme(root, OXIDE_LEDGER_THEME.dark);
    flushFrames({ includeCancelled: true });
    expect(root.style.getPropertyValue("--background")).toBe(
      OXIDE_LEDGER_THEME.dark.background,
    );

    secondCleanup();
    expect(root.style.getPropertyValue("--background")).toBe("original");
  });
});

describe("renderer palette boundary", () => {
  it("contains no six-digit hexadecimal colors in renderer TSX or CSS", () => {
    const sources = import.meta.glob<string>(["../**/*.tsx", "../**/*.css"], {
      query: "?raw",
      import: "default",
      eager: true,
    });
    const matches = Object.entries(sources).flatMap(([path, source]) =>
      path.includes(".test.")
        ? []
        : source
            .split("\n")
            .flatMap((line, index) =>
              /#[\da-f]{6}\b/i.test(line) ? [`${path}:${index + 1}`] : [],
            ),
    );

    expect(matches).toEqual([]);
  });
});
