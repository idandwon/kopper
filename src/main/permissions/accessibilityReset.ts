import { APP_BUNDLE_ID } from "../../shared/appIdentity";

interface AccessibilityResetExecOptions {
  encoding: "utf8";
  timeout: 5000;
  windowsHide: true;
  maxBuffer: 4096;
}

type AccessibilityResetCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;

export type AccessibilityResetExecFile = (
  file: "/usr/bin/tccutil",
  args: ["reset", "Accessibility", typeof APP_BUNDLE_ID],
  options: AccessibilityResetExecOptions,
  callback: AccessibilityResetCallback,
) => unknown;

export function resetAccessibilityAccess(
  execFile: AccessibilityResetExecFile,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "/usr/bin/tccutil",
      ["reset", "Accessibility", APP_BUNDLE_ID],
      {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
        maxBuffer: 4096,
      },
      (error) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve();
      },
    );
  });
}
