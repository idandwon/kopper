import type { KopperApi } from "../../src/shared/ipc/contract";
import {
  continueWithoutCaptureIfNeeded,
  expect,
  test,
} from "./fixtures/electronApp";

const DOCUMENTED_BRIDGE_METHODS = [
  "chooseDataImport",
  "confirmDataImport",
  "continueWithoutCapture",
  "copyNotes",
  "createNewStore",
  "execute",
  "exportData",
  "exportRecoveryBytes",
  "exportTheme",
  "getAccessibilityPermission",
  "getAccessibilitySession",
  "getDataPath",
  "getDocument",
  "getNativeAppearance",
  "importTheme",
  "onAccessibilityPermissionChanged",
  "onCaptureOutcome",
  "onNativeAppearanceChanged",
  "onOpenSettings",
  "openAccessibilitySettings",
  "openEditorWindow",
  "requestCapture",
  "saveShortcuts",
  "setPinned",
  "subscribeDocument",
  "undo",
  "validateShortcuts",
] as const;

test("keeps renderer isolation, navigation, bridge validation, and CSP intact", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper();
  await continueWithoutCaptureIfNeeded(page);

  const shape = await page.evaluate(() => ({
    process: typeof window.process,
    require: typeof (window as Window & { require?: unknown }).require,
    ipcRenderer: typeof (window as Window & { ipcRenderer?: unknown }).ipcRenderer,
    electron: typeof (window as Window & { electron?: unknown }).electron,
    fs: typeof (window as Window & { fs?: unknown }).fs,
    bridge: Object.keys((window as unknown as { kopper: KopperApi }).kopper).sort(),
  }));
  expect(shape).toEqual({
    process: "undefined",
    require: "undefined",
    ipcRenderer: "undefined",
    electron: "undefined",
    fs: "undefined",
    bridge: [...DOCUMENTED_BRIDGE_METHODS].sort(),
  });

  const originalUrl = page.url();
  await page.evaluate(() => {
    window.location.href = "https://example.com/navigation-must-be-blocked";
  });
  await expect.poll(() => page.url()).toBe(originalUrl);

  const windowCount = kopper.electronApp.windows().length;
  const remotePage = kopper.electronApp.waitForEvent("window", { timeout: 750 }).then(
    () => true,
    () => false,
  );
  await page.evaluate(() => {
    window.open("https://example.com/window-must-be-blocked", "_blank");
  });
  expect(await remotePage).toBe(false);
  expect(kopper.electronApp.windows()).toHaveLength(windowCount);

  const inlineExecuted = await page.evaluate(async () => {
    const marker = "__kopperInlineScriptExecuted";
    const script = document.createElement("script");
    script.textContent = `window.${marker} = true`;
    document.head.append(script);
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    return (window as unknown as Record<string, unknown>)[marker] === true;
  });
  expect(inlineExecuted).toBe(false);

  const missingNote = await page.evaluate(() =>
    (window as unknown as { kopper: KopperApi }).kopper.openEditorWindow(
      "missing-note-id",
    ),
  );
  expect(missingNote).toEqual({
    ok: false,
    error: {
      code: "validation_failed",
      message: "The requested note does not exist.",
      retryable: false,
    },
  });

  const malformedRejected = await page.evaluate(async () => {
    try {
      const api = (window as unknown as { kopper: KopperApi }).kopper;
      await api.execute({ type: "note.delete", noteIds: [] });
      return false;
    } catch {
      return true;
    }
  });
  expect(malformedRejected).toBe(true);

  await kopper.closeKopper();
});
