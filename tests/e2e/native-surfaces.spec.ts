import {
  continueWithoutCaptureIfNeeded,
  expect,
  test,
  type KopperE2E,
} from "./fixtures/electronApp";
import { setSurfaceSize } from "./helpers/surfaceGeometry";

const OPEN_SETTINGS_CHANNEL = "kopper:settings:open";

async function mainWindowState(kopper: KopperE2E) {
  return kopper.electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(
      (candidate) => !candidate.webContents.getURL().endsWith("#capture-hud"),
    );
    if (window === undefined) return null;
    return {
      bounds: window.getBounds(),
      focused: window.isFocused(),
      visible: window.isVisible(),
    };
  });
}

test("routes the fixed live main-process Settings event to Shortcuts and focus", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper();
  await continueWithoutCaptureIfNeeded(page);

  await kopper.electronApp.evaluate(
    ({ BrowserWindow }, channel) => {
      const window = BrowserWindow.getAllWindows().find(
        (candidate) => !candidate.webContents.getURL().endsWith("#capture-hud"),
      );
      if (window === undefined) return;
      window.show();
      window.focus();
      window.webContents.send(channel);
    },
    OPEN_SETTINGS_CHANNEL,
  );

  await expect(page.getByRole("tab", { name: "Shortcuts" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Shortcuts & panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to notes" })).toBeFocused();
  await expect.poll(async () => (await mainWindowState(kopper))?.focused).toBe(true);

  await page.getByRole("button", { name: "Back to notes" }).click();
  await expect(page.getByRole("searchbox", { name: "Search notes" })).toBeFocused();
});

test("renders the actual focusless 340x72 HUD anchored to a hidden panel", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper();
  await continueWithoutCaptureIfNeeded(page);
  await setSurfaceSize(page, 340, 480);
  await kopper.electronApp.evaluate(({ systemPreferences }) => {
    Object.defineProperty(systemPreferences, "isTrustedAccessibilityClient", {
      configurable: true,
      value: () => false,
    });
  });

  const panelBeforeCapture = await mainWindowState(kopper);
  expect(panelBeforeCapture).not.toBeNull();
  await kopper.electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(
      (candidate) => !candidate.webContents.getURL().endsWith("#capture-hud"),
    );
    window?.hide();
  });

  const hudWindowCreated = kopper.electronApp.waitForEvent("window");
  const outcome = await page.evaluate(() => window.kopper.requestCapture());
  expect(outcome).toMatchObject({
    status: "failed",
    error: { code: "permission_denied" },
  });
  const hud = await hudWindowCreated;
  await expect(hud).toHaveURL(/#capture-hud$/);
  await expect(hud.getByRole("status")).toHaveText(
    "Capture needs Accessibility access",
  );

  await page.evaluate(() => window.kopper.requestCapture());
  const runtime = await kopper.electronApp.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    const main = windows.find(
      (window) => !window.webContents.getURL().endsWith("#capture-hud"),
    );
    const captureHud = windows.find((window) =>
      window.webContents.getURL().endsWith("#capture-hud"),
    );
    if (main === undefined || captureHud === undefined) return null;
    return {
      mainBounds: main.getBounds(),
      mainFocused: main.isFocused(),
      mainVisible: main.isVisible(),
      hudBounds: captureHud.getBounds(),
      hudFocusable: captureHud.isFocusable(),
      hudFocused: captureHud.isFocused(),
      hudVisible: captureHud.isVisible(),
    };
  });
  expect(runtime).not.toBeNull();
  if (runtime === null || panelBeforeCapture === null) return;
  expect(runtime.mainBounds).toEqual(panelBeforeCapture.bounds);
  expect(runtime.mainVisible).toBe(false);
  expect(runtime.mainFocused).toBe(false);
  expect(runtime.hudBounds).toEqual({
    x: runtime.mainBounds.x + runtime.mainBounds.width - 340,
    y: runtime.mainBounds.y + runtime.mainBounds.height - 72,
    width: 340,
    height: 72,
  });
  expect(runtime.hudFocusable).toBe(false);
  expect(runtime.hudFocused).toBe(false);
  expect(runtime.hudVisible).toBe(true);

  const geometry = await hud.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const status = document.querySelector<HTMLElement>('[role="status"]');
    const statusBounds = status?.getBoundingClientRect();
    return {
      clientWidth: root.clientWidth,
      clientHeight: root.clientHeight,
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
      bodyScrollWidth: body.scrollWidth,
      bodyScrollHeight: body.scrollHeight,
      scrollTop: document.scrollingElement?.scrollTop ?? 0,
      scrollLeft: document.scrollingElement?.scrollLeft ?? 0,
      statusBounds:
        statusBounds === undefined
          ? null
          : {
              left: statusBounds.left,
              top: statusBounds.top,
              right: statusBounds.right,
              bottom: statusBounds.bottom,
            },
    };
  });
  expect(geometry).toEqual({
    clientWidth: 340,
    clientHeight: 72,
    scrollWidth: 340,
    scrollHeight: 72,
    bodyScrollWidth: 340,
    bodyScrollHeight: 72,
    scrollTop: 0,
    scrollLeft: 0,
    statusBounds: expect.objectContaining({
      left: expect.any(Number),
      top: expect.any(Number),
      right: expect.any(Number),
      bottom: expect.any(Number),
    }),
  });
  expect(geometry.statusBounds?.left).toBeGreaterThanOrEqual(0);
  expect(geometry.statusBounds?.top).toBeGreaterThanOrEqual(0);
  expect(geometry.statusBounds?.right).toBeLessThanOrEqual(340);
  expect(geometry.statusBounds?.bottom).toBeLessThanOrEqual(72);

  await expect
    .poll(async () => {
      const state = await kopper.electronApp.evaluate(({ BrowserWindow }) => {
        const windows = BrowserWindow.getAllWindows();
        const main = windows.find(
          (window) => !window.webContents.getURL().endsWith("#capture-hud"),
        );
        const captureHud = windows.find((window) =>
          window.webContents.getURL().endsWith("#capture-hud"),
        );
        return {
          mainVisible: main?.isVisible() ?? false,
          hudVisible: captureHud?.isVisible() ?? false,
        };
      });
      return state;
    })
    .toEqual({ mainVisible: false, hudVisible: false });
});
