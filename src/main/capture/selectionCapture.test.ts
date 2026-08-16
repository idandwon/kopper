import { describe, expect, it, vi } from "vitest";

import type {
  ClipboardAdapter,
  NativeImageAdapter,
  NativeImageFactory,
} from "./clipboardSnapshot";
import {
  SelectionCapture,
  type ExecFileAdapter,
} from "./selectionCapture";
import { SELECTION_CAPTURE_JXA } from "./selectionScript";

function emptyImage(): NativeImageAdapter {
  return { isEmpty: () => true, toPNG: () => Buffer.alloc(0) };
}

function makeClipboard(capturedText = "captured"): ClipboardAdapter {
  return {
    availableFormats: vi.fn(() => ["public.utf8-plain-text"]),
    readText: vi
      .fn<() => string>()
      .mockReturnValueOnce("clipboard before capture")
      .mockReturnValueOnce(capturedText),
    readHTML: vi.fn(() => ""),
    readRTF: vi.fn(() => ""),
    readBookmark: vi.fn(() => ({ title: "", url: "" })),
    readImage: vi.fn(() => emptyImage()),
    clear: vi.fn(),
    write: vi.fn(),
  };
}

function makeNativeImage(): NativeImageFactory {
  return { createFromBuffer: vi.fn() };
}

function completingExec(
  stdout: string,
  error: Error | null = null,
): ExecFileAdapter {
  return vi.fn((_file, _args, _options, callback) => {
    callback(error, stdout, "native diagnostic");
  });
}

function makeCapture(
  scenario: "success" | "timeout" | "empty" | "exec-failure",
): { capture: SelectionCapture; clipboard: ClipboardAdapter } {
  const clipboard = makeClipboard(scenario === "empty" ? " \t\n " : "  exact \n text  ");
  const execFile =
    scenario === "exec-failure"
      ? completingExec("", new Error("private native failure"))
      : completingExec(scenario === "timeout" ? "timeout\n" : "changed\n");
  return {
    capture: new SelectionCapture({
      clipboard,
      nativeImage: makeNativeImage(),
      execFile,
    }),
    clipboard,
  };
}

describe("SelectionCapture", () => {
  it("uses only fixed osascript arguments and hardened exec options", async () => {
    const execFile = completingExec("timeout\n");
    const capture = new SelectionCapture({
      clipboard: makeClipboard(),
      nativeImage: makeNativeImage(),
      execFile,
    });

    await capture.capture();

    expect(execFile).toHaveBeenCalledWith(
      "osascript",
      ["-l", "JavaScript", "-e", SELECTION_CAPTURE_JXA],
      {
        encoding: "utf8",
        timeout: 1000,
        windowsHide: true,
        maxBuffer: 4096,
      },
      expect.any(Function),
    );
    expect(vi.mocked(execFile).mock.calls[0]?.[2]).not.toHaveProperty("shell");
  });

  it("returns selected text exactly without trimming it", async () => {
    const { capture } = makeCapture("success");

    await expect(capture.capture()).resolves.toEqual({
      ok: true,
      value: "  exact \n text  ",
    });
  });

  it("classifies whitespace-only captured text as nothing selected", async () => {
    const { capture } = makeCapture("empty");

    await expect(capture.capture()).resolves.toMatchObject({
      ok: false,
      error: { code: "nothing_selected" },
    });
  });

  it("returns a structured timeout without reading captured text", async () => {
    const { capture, clipboard } = makeCapture("timeout");

    await expect(capture.capture()).resolves.toMatchObject({
      ok: false,
      error: { code: "capture_timeout" },
    });
    expect(clipboard.readText).toHaveBeenCalledTimes(1);
  });

  it("normalizes only one trailing status line ending", async () => {
    const clipboard = makeClipboard("should not be read");
    const capture = new SelectionCapture({
      clipboard,
      nativeImage: makeNativeImage(),
      execFile: completingExec("changed\n\n"),
    });

    await expect(capture.capture()).resolves.toMatchObject({
      ok: false,
      error: { code: "capture_failed" },
    });
    expect(clipboard.readText).toHaveBeenCalledTimes(1);
  });

  it.each(["success", "timeout", "empty", "exec-failure"] as const)(
    "restores the clipboard after %s",
    async (scenario) => {
      const { capture, clipboard } = makeCapture(scenario);

      await capture.capture();

      expect(clipboard.write).toHaveBeenCalledOnce();
      expect(clipboard.write).toHaveBeenCalledWith({
        text: "clipboard before capture",
      });
    },
  );

  it("restores after reading the changed clipboard fails", async () => {
    const clipboard = makeClipboard();
    vi.mocked(clipboard.readText)
      .mockReset()
      .mockReturnValueOnce("clipboard before capture")
      .mockImplementationOnce(() => {
        throw new Error("captured private text");
      });
    const capture = new SelectionCapture({
      clipboard,
      nativeImage: makeNativeImage(),
      execFile: completingExec("changed\r\n"),
    });

    await expect(capture.capture()).resolves.toMatchObject({
      ok: false,
      error: { code: "capture_failed" },
    });
    expect(clipboard.write).toHaveBeenCalledWith({
      text: "clipboard before capture",
    });
  });

  it("lets a restore failure override every other result with a sanitized error", async () => {
    const clipboard = makeClipboard("secret selected text");
    vi.mocked(clipboard.write).mockImplementation(() => {
      throw new Error("private restore diagnostic");
    });
    const capture = new SelectionCapture({
      clipboard,
      nativeImage: makeNativeImage(),
      execFile: completingExec("changed\n"),
    });

    const result = await capture.capture();

    expect(result).toEqual({
      ok: false,
      error: {
        code: "capture_failed",
        message: "Kopper could not capture the selected text.",
        retryable: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret selected text");
    expect(JSON.stringify(result)).not.toContain("private restore diagnostic");
  });
});
