import type { KopperError, Result } from "../../shared/domain/errors";
import {
  restoreClipboard,
  snapshotClipboard,
  type ClipboardAdapter,
  type ClipboardSnapshot,
  type NativeImageFactory,
} from "./clipboardSnapshot";
import { SELECTION_CAPTURE_JXA } from "./selectionScript";

interface ExecFileOptions {
  encoding: "utf8";
  timeout: 1000;
  windowsHide: true;
  maxBuffer: 4096;
}

type ExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;

export type ExecFileAdapter = (
  file: "osascript",
  args: string[],
  options: ExecFileOptions,
  callback: ExecFileCallback,
) => unknown;

export interface SelectionCaptureDependencies {
  clipboard: ClipboardAdapter;
  nativeImage: NativeImageFactory;
  execFile: ExecFileAdapter;
}

const CAPTURE_FAILED: KopperError = {
  code: "capture_failed",
  message: "Kopper could not capture the selected text.",
  retryable: true,
};

const CAPTURE_TIMEOUT: KopperError = {
  code: "capture_timeout",
  message: "Kopper timed out while capturing the selected text.",
  retryable: true,
};

const NOTHING_SELECTED: KopperError = {
  code: "nothing_selected",
  message: "No selected text was available to capture.",
  retryable: true,
};

function failure(error: KopperError): Result<never, KopperError> {
  return { ok: false, error: { ...error } };
}

function normalizeStatusLine(stdout: string): string {
  if (stdout.endsWith("\r\n")) return stdout.slice(0, -2);
  if (stdout.endsWith("\r") || stdout.endsWith("\n")) {
    return stdout.slice(0, -1);
  }
  return stdout;
}

function executeCaptureScript(execFile: ExecFileAdapter): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-l", "JavaScript", "-e", SELECTION_CAPTURE_JXA],
      {
        encoding: "utf8",
        timeout: 1000,
        windowsHide: true,
        maxBuffer: 4096,
      },
      (error, stdout) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

export class SelectionCapture {
  constructor(private readonly dependencies: SelectionCaptureDependencies) {}

  async capture(): Promise<Result<string, KopperError>> {
    let before: ClipboardSnapshot;
    try {
      before = snapshotClipboard(this.dependencies.clipboard);
    } catch {
      return failure(CAPTURE_FAILED);
    }

    let result: Result<string, KopperError> = failure(CAPTURE_FAILED);
    let restoreFailed = false;

    try {
      const stdout = await executeCaptureScript(this.dependencies.execFile);
      const status = normalizeStatusLine(stdout);

      if (status === "timeout") {
        result = failure(CAPTURE_TIMEOUT);
      } else if (status === "changed") {
        const selectedText = this.dependencies.clipboard.readText();
        result =
          selectedText.trim().length === 0
            ? failure(NOTHING_SELECTED)
            : { ok: true, value: selectedText };
      }
    } catch {
      result = failure(CAPTURE_FAILED);
    } finally {
      try {
        restoreClipboard(
          this.dependencies.clipboard,
          before,
          this.dependencies.nativeImage,
        );
      } catch {
        restoreFailed = true;
      }
    }

    return restoreFailed ? failure(CAPTURE_FAILED) : result;
  }
}
