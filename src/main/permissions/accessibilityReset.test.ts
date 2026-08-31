import { describe, expect, it, vi } from "vitest";

import {
  resetAccessibilityAccess,
  type AccessibilityResetExecFile,
} from "./accessibilityReset";

function completingExec(error: Error | null = null): AccessibilityResetExecFile {
  return vi.fn((_file, _args, _options, callback) => {
    callback(error, "", "native diagnostic");
  });
}

describe("resetAccessibilityAccess", () => {
  it("executes only the fixed Kopper Accessibility reset", async () => {
    const execFile = completingExec();

    await expect(resetAccessibilityAccess(execFile)).resolves.toBeUndefined();

    expect(execFile).toHaveBeenCalledExactlyOnceWith(
      "/usr/bin/tccutil",
      ["reset", "Accessibility", "com.kopper.app"],
      {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
        maxBuffer: 4096,
      },
      expect.any(Function),
    );
    expect(vi.mocked(execFile).mock.calls[0]?.[2]).not.toHaveProperty("shell");
  });

  it("rejects when tccutil cannot reset the decision", async () => {
    const execFile = completingExec(new Error("private native failure"));

    await expect(resetAccessibilityAccess(execFile)).rejects.toThrow(
      "private native failure",
    );
  });
});
