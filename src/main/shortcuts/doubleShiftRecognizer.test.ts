import { describe, expect, it } from "vitest";

import {
  DoubleShiftRecognizer,
  type ModifierEvent,
} from "./doubleShiftRecognizer";

function feed(
  recognizer: DoubleShiftRecognizer,
  events: ModifierEvent[],
): Array<"capture" | null> {
  return events.map((event) => recognizer.feed(event));
}

function tap(
  key: "shift-left" | "shift-right",
  downAt: number,
  upAt: number,
): ModifierEvent[] {
  return [
    { type: "down", key, at: downAt },
    { type: "up", key, at: upAt },
  ];
}

describe("DoubleShiftRecognizer", () => {
  it("emits once for two complete Shift taps within 400 ms", () => {
    const recognizer = new DoubleShiftRecognizer();

    expect(
      feed(recognizer, [
        ...tap("shift-left", 10, 20),
        ...tap("shift-left", 419, 420),
      ]),
    ).toEqual([null, null, null, "capture"]);
  });

  it("ignores held-key repeat events without cancelling the tap", () => {
    const recognizer = new DoubleShiftRecognizer();

    expect(
      feed(recognizer, [
        { type: "down", key: "shift-left", at: 0 },
        { type: "down", key: "shift-left", at: 10 },
        { type: "down", key: "shift-left", at: 20 },
        { type: "up", key: "shift-left", at: 30 },
        ...tap("shift-right", 40, 50),
      ]),
    ).toEqual([null, null, null, null, null, "capture"]);
  });

  it("cancels a partial gesture until another key is released", () => {
    const recognizer = new DoubleShiftRecognizer();

    expect(
      feed(recognizer, [
        ...tap("shift-left", 0, 10),
        { type: "down", key: "other", at: 20 },
        { type: "up", key: "other", at: 21 },
        ...tap("shift-left", 30, 40),
        ...tap("shift-right", 50, 60),
      ]),
    ).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "capture",
    ]);
  });

  it("stays cancelled through two Shift taps while another key is held", () => {
    const recognizer = new DoubleShiftRecognizer();

    expect(
      feed(recognizer, [
        { type: "down", key: "other", at: 0 },
        ...tap("shift-left", 10, 20),
        ...tap("shift-right", 30, 40),
        { type: "up", key: "other", at: 50 },
        ...tap("shift-left", 60, 70),
        ...tap("shift-right", 80, 90),
      ]),
    ).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "capture",
    ]);
  });

  it("cancels a held tap when another key occurs before Shift up", () => {
    const recognizer = new DoubleShiftRecognizer();

    expect(
      feed(recognizer, [
        { type: "down", key: "shift-left", at: 0 },
        { type: "down", key: "other", at: 1 },
        { type: "up", key: "shift-left", at: 2 },
        ...tap("shift-left", 3, 4),
      ]),
    ).toEqual([null, null, null, null, null]);
  });

  it("does not emit when tap completions are 401 ms apart", () => {
    const recognizer = new DoubleShiftRecognizer();

    expect(
      feed(recognizer, [
        ...tap("shift-left", 0, 10),
        ...tap("shift-left", 410, 411),
      ]),
    ).toEqual([null, null, null, null]);
  });

  it("uses an out-of-order completion as a fresh baseline and then recovers", () => {
    const recognizer = new DoubleShiftRecognizer();

    expect(
      feed(recognizer, [
        ...tap("shift-left", 90, 100),
        ...tap("shift-right", 40, 50),
        ...tap("shift-left", 60, 70),
        ...tap("shift-right", 80, 90),
      ]),
    ).toEqual([
      null,
      null,
      null,
      null,
      null,
      "capture",
      null,
      null,
    ]);
  });

  it("accepts sequential left then right Shift taps", () => {
    const recognizer = new DoubleShiftRecognizer();

    expect(
      feed(recognizer, [
        ...tap("shift-left", 0, 10),
        ...tap("shift-right", 20, 30),
      ]),
    ).toEqual([null, null, null, "capture"]);
  });

  it("emits only once for three taps", () => {
    const recognizer = new DoubleShiftRecognizer();

    expect(
      feed(recognizer, [
        ...tap("shift-left", 0, 10),
        ...tap("shift-left", 20, 30),
        ...tap("shift-left", 40, 50),
      ]),
    ).toEqual([null, null, null, "capture", null, null]);
  });

  it.each([
    ["shift-left", "shift-right"],
    ["shift-right", "shift-left"],
  ] as const)(
    "cancels overlapping %s then %s until both keys are up",
    (first, second) => {
      const recognizer = new DoubleShiftRecognizer();

      expect(
        feed(recognizer, [
          { type: "down", key: first, at: 0 },
          { type: "down", key: second, at: 1 },
          { type: "up", key: first, at: 2 },
          { type: "up", key: second, at: 3 },
          ...tap(first, 10, 20),
          ...tap(second, 30, 40),
        ]),
      ).toEqual([null, null, null, null, null, null, null, "capture"]);
    },
  );

  it("reset clears both a partial tap and the timing window", () => {
    const recognizer = new DoubleShiftRecognizer();

    recognizer.feed({ type: "down", key: "shift-left", at: 0 });
    recognizer.reset();
    expect(
      recognizer.feed({ type: "up", key: "shift-left", at: 1 }),
    ).toBeNull();

    feed(recognizer, tap("shift-left", 10, 20));
    recognizer.reset();
    expect(feed(recognizer, tap("shift-left", 30, 40))).toEqual([null, null]);
  });
});
