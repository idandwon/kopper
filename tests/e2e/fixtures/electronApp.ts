import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

import {
  createEmptyDocument,
  parseDocument,
  type KopperDocument,
} from "../../../src/shared/domain/document";

const TEMP_PREFIX = "kopper-e2e-";
const STORE_FILE_NAME = "kopper.json";
const MAIN_PATH = join(process.cwd(), "out/main/index.js");

type InitialStore = KopperDocument | string | Uint8Array;

export interface KopperE2E {
  readonly userDataDirectory: string;
  readonly storePath: string;
  readonly page: Page;
  readonly electronApp: ElectronApplication;
  launchKopper(initialStore?: InitialStore): Promise<Page>;
  relaunchKopper(): Promise<Page>;
  closeKopper(): Promise<void>;
  readPersistedDocument(): Promise<KopperDocument>;
  readPersistedBytes(): Promise<Buffer>;
  readClipboardText(): Promise<string>;
  stubNextOpenDialog(path: string | null): Promise<void>;
  stubNextSaveDialog(path: string | null): Promise<void>;
}

class IsolatedKopper implements KopperE2E {
  private application: ElectronApplication | undefined;
  private currentPage: Page | undefined;
  private launched = false;
  private closed = true;

  private constructor(
    readonly userDataDirectory: string,
    readonly storePath: string,
  ) {}

  static async create(): Promise<IsolatedKopper> {
    const directory = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
    return new IsolatedKopper(directory, join(directory, STORE_FILE_NAME));
  }

  get page(): Page {
    if (this.currentPage === undefined) throw new Error("Kopper is not running.");
    return this.currentPage;
  }

  get electronApp(): ElectronApplication {
    if (this.application === undefined) throw new Error("Kopper is not running.");
    return this.application;
  }

  async launchKopper(initialStore: InitialStore = createEmptyDocument()): Promise<Page> {
    if (this.application !== undefined) throw new Error("Kopper is already running.");
    if (this.launched) throw new Error("Use relaunchKopper() to reuse the isolated store.");

    const bytes =
      typeof initialStore === "string" || initialStore instanceof Uint8Array
        ? initialStore
        : `${JSON.stringify(initialStore, null, 2)}\n`;
    await writeFile(this.storePath, bytes);
    this.launched = true;
    return this.start();
  }

  async relaunchKopper(): Promise<Page> {
    if (!this.launched) throw new Error("Launch Kopper before relaunching it.");
    if (!this.closed || this.application !== undefined) {
      throw new Error("Close Kopper before relaunching it.");
    }
    return this.start();
  }

  async closeKopper(): Promise<void> {
    const application = this.application;
    if (application === undefined) return;
    const child = application.process();
    await application.evaluate(async ({ app }) => {
      app.quit();
    });
    await expect
      .poll(() => child.exitCode, {
        message: `Electron process ${child.pid ?? "unknown"} did not exit after controlled quit`,
        timeout: 10_000,
      })
      .not.toBeNull();
    this.application = undefined;
    this.currentPage = undefined;
    this.closed = true;
  }

  async readPersistedDocument(): Promise<KopperDocument> {
    this.assertClosedForEvidence();
    const input: unknown = JSON.parse(await readFile(this.storePath, "utf8"));
    const parsed = parseDocument(input);
    if (!parsed.ok) throw new Error(parsed.error.message);
    return parsed.value;
  }

  async readPersistedBytes(): Promise<Buffer> {
    this.assertClosedForEvidence();
    return readFile(this.storePath);
  }

  readClipboardText(): Promise<string> {
    return this.electronApp.evaluate(async ({ clipboard }) => clipboard.readText());
  }

  async stubNextOpenDialog(path: string | null): Promise<void> {
    if (path !== null) this.assertFixturePath(path);
    await this.electronApp.evaluate(async ({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () =>
        selectedPath === null
          ? { canceled: true, filePaths: [] }
          : { canceled: false, filePaths: [selectedPath] };
    }, path);
  }

  async stubNextSaveDialog(path: string | null): Promise<void> {
    if (path !== null) this.assertFixturePath(path);
    await this.electronApp.evaluate(async ({ dialog }, selectedPath) => {
      dialog.showSaveDialog = async () =>
        selectedPath === null
          ? { canceled: true, filePath: "" }
          : { canceled: false, filePath: selectedPath };
    }, path);
  }

  async destroy(): Promise<void> {
    if (this.application !== undefined) await this.closeKopper();
    await rm(this.userDataDirectory, { recursive: true });
    await expect
      .poll(async () => {
        try {
          await access(this.userDataDirectory, constants.F_OK);
          return true;
        } catch {
          return false;
        }
      })
      .toBe(false);
  }

  private async start(): Promise<Page> {
    this.application = await electron.launch({
      args: [MAIN_PATH, `--user-data-dir=${this.userDataDirectory}`],
    });
    this.closed = false;
    this.currentPage = await this.application.firstWindow();
    await expect(this.currentPage).toHaveTitle("Kopper");
    return this.currentPage;
  }

  private assertClosedForEvidence(): void {
    if (!this.closed || this.application !== undefined) {
      throw new Error("Persisted evidence may be read only after controlled close.");
    }
  }

  private assertFixturePath(path: string): void {
    if (!isAbsolute(path)) throw new Error("Dialog paths must be absolute.");
    const child = relative(resolve(this.userDataDirectory), resolve(path));
    if (child === "" || child.startsWith("..") || isAbsolute(child)) {
      throw new Error("Dialog paths must stay inside the isolated user-data directory.");
    }
  }
}

export const test = base.extend<{ kopper: KopperE2E }>({
  kopper: async ({}, use) => {
    const instance = await IsolatedKopper.create();
    try {
      await use(instance);
    } finally {
      await instance.destroy();
    }
  },
});

export { expect } from "@playwright/test";

export async function continueWithoutCaptureIfNeeded(page: Page): Promise<void> {
  const continueButton = page.getByRole("button", { name: "Continue without capture" });
  const search = page.getByRole("searchbox", { name: "Search notes" });
  await expect(continueButton.or(search)).toBeVisible();
  if (await continueButton.isVisible()) await continueButton.click();
  await expect(search).toBeVisible();
}

export function fixturePath(kopper: KopperE2E, name: string): string {
  return join(kopper.userDataDirectory, name);
}
