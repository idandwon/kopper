import { describe, expect, it } from "vitest";

import { SELECTION_CAPTURE_JXA as selectionCaptureScript } from "./selectionScript";

describe("SELECTION_CAPTURE_JXA", () => {
  it("is fixed, non-shell script source with bounded polling and exact stdout", () => {
    expect(selectionCaptureScript).not.toContain("${");
    expect(selectionCaptureScript).not.toContain("console.log");
    expect(selectionCaptureScript).not.toMatch(/\bshell\b/i);
    expect(selectionCaptureScript).toContain(
      "$.NSPasteboard.generalPasteboard.changeCount",
    );
    expect(selectionCaptureScript).toContain(
      'Application("System Events").keystroke("c", { using: "command down" })',
    );
    expect(selectionCaptureScript).toContain("attempt < 30");
    expect(selectionCaptureScript).toContain("delay(0.02)");
    expect(selectionCaptureScript).toContain(
      "$.NSFileHandle.fileHandleWithStandardOutput.writeData",
    );
    expect(selectionCaptureScript).toContain('"changed\\n"');
    expect(selectionCaptureScript).toContain('"timeout\\n"');
  });
});
