/// <reference types="node" />

import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli, verifyPackage } from "./verify-package.mjs";

interface FixtureOptions {
  info?: Record<string, unknown>;
  asarEntries?: string[];
  asarFiles?: Record<string, string>;
  nativeFiles?: string[];
  updaterConfigurations?: string[];
  architectures?: Record<string, string[]>;
}

const temporaryDirectories: string[] = [];

async function createFixture(options: FixtureOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "kopper-package-test-"));
  temporaryDirectories.push(root);
  const appPath = join(root, "Kopper.app");
  const resourcesPath = join(appPath, "Contents", "Resources");
  const executablePath = join(appPath, "Contents", "MacOS", "Kopper");
  const nativePath = join(
    resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "uiohook-napi",
    "build",
    "Release",
    "uiohook_napi.node",
  );
  await mkdir(join(appPath, "Contents", "MacOS"), { recursive: true });
  await mkdir(join(resourcesPath, "app.asar.unpacked"), { recursive: true });
  await writeFile(join(resourcesPath, "app.asar"), "fake asar");
  await writeFile(executablePath, "fake executable");
  await mkdir(join(nativePath, ".."), { recursive: true });
  await writeFile(nativePath, "fake native module");

  const info = {
    CFBundleIdentifier: "com.kopper.app",
    CFBundleExecutable: "Kopper",
    LSMinimumSystemVersion: "14.0",
    NSAppleEventsUsageDescription:
      "Kopper uses System Events only when you invoke capture, so it can copy the text you selected.",
    ...options.info,
  };
  const asarEntries = options.asarEntries ?? [
    "/package.json",
    "/out/renderer/index.html",
    "/out/renderer/assets/index.js",
  ];
  const asarFiles: Record<string, string> = {
    "/package.json": JSON.stringify({ name: "kopper", version: "0.1.0" }),
    "/out/renderer/index.html": '<script type="module" src="./assets/index.js"></script>',
    "/out/renderer/assets/index.js": "console.log('local renderer')",
    ...options.asarFiles,
  };
  const nativeFiles = options.nativeFiles ?? [nativePath];
  const architectures = options.architectures ?? {
    [executablePath]: ["arm64", "x86_64"],
    [nativePath]: ["arm64", "x86_64"],
  };
  const lipoCalls: string[] = [];

  return {
    appPath,
    executablePath,
    nativePath,
    lipoCalls,
    ports: {
      readInfoPlist: vi.fn(async () => info),
      listAsarEntries: vi.fn(async () => asarEntries),
      readAsarEntry: vi.fn(async (_asarPath: string, entry: string) =>
        Buffer.from(asarFiles[entry] ?? ""),
      ),
      findNativeBinaries: vi.fn(async () => nativeFiles),
      findUpdaterConfigurations: vi.fn(
        async () => options.updaterConfigurations ?? [],
      ),
      readArchitectures: vi.fn(async (path: string) => {
        lipoCalls.push(path);
        return architectures[path] ?? [];
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function failureCodes(result: Awaited<ReturnType<typeof verifyPackage>>) {
  return result.failures.map((failure) => failure.code);
}

describe("package verifier", () => {
  it.each([
    ["CFBundleIdentifier", "wrong.identifier", "invalid_bundle_identifier"],
    ["LSMinimumSystemVersion", "13.0", "invalid_minimum_system_version"],
    ["NSAppleEventsUsageDescription", undefined, "missing_apple_events_usage_description"],
  ])("rejects invalid %s metadata", async (key, value, code) => {
    const fixture = await createFixture({ info: { [key]: value } });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(result.ok).toBe(false);
    expect(failureCodes(result)).toContain(code);
  });

  it.each([
    ["double-quoted HTML script", '<script src="https://cdn.example.invalid/remote.js"></script>'],
    ["single-quoted HTML script", "<script src='http://cdn.example.invalid/remote.js'></script>"],
    ["unquoted HTML script", "<script defer src=https://cdn.example.invalid/remote.js></script>"],
    ["single-quoted dynamic import", "void import('https://cdn.example.invalid/module.js')"],
    ["double-quoted dynamic import", 'void import("http://cdn.example.invalid/module.js")'],
    ["template dynamic import", "void import(`https://cdn.example.invalid/module.js`)"],
    ["single-quoted importScripts", "importScripts('https://cdn.example.invalid/worker.js')"],
    ["double-quoted importScripts", 'importScripts("http://cdn.example.invalid/worker.js")'],
    ["template importScripts", "importScripts(`https://cdn.example.invalid/worker.js`)"],
    ["static side-effect import", "import 'https://cdn.example.invalid/module.js'"],
    ["static import-from", "import remote from 'https://cdn.example.invalid/module.js'"],
    ["static export-from", "export { remote } from `https://cdn.example.invalid/module.js`"],
  ])("rejects a %s remote renderer source", async (_name, content) => {
    const fixture = await createFixture({
      asarFiles: { "/out/renderer/assets/index.js": content },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(failureCodes(result)).toContain("remote_renderer_script_source");
  });

  it("allows benign non-script HTTP and HTTPS document URLs", async () => {
    const fixture = await createFixture({
      asarFiles: {
        "/out/renderer/index.html": [
          '<script type="application/ld+json">',
          '{"@context":"https://schema.org","url":"https://kopper.example.invalid"}',
          "</script>",
          '<a href="http://docs.example.invalid/help">Help</a>',
        ].join(""),
        "/out/renderer/assets/index.js":
          'const schemas = ["https://schema.org", "http://json-schema.org/draft-07/schema"]',
      },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(result.ok).toBe(true);
    expect(failureCodes(result)).not.toContain("remote_renderer_script_source");
  });

  it("rejects a missing unpacked uiohook native module", async () => {
    const fixture = await createFixture({ nativeFiles: [] });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(failureCodes(result)).toContain("missing_uiohook_native_module");
  });

  it("rejects an updater package in the ASAR", async () => {
    const fixture = await createFixture({
      asarEntries: [
        "/package.json",
        "/out/renderer/index.html",
        "/node_modules/electron-updater/package.json",
      ],
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(failureCodes(result)).toContain("updater_package_present");
  });

  it("rejects updater configuration beside the ASAR", async () => {
    const fixture = await createFixture({
      updaterConfigurations: ["app-update.yml"],
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(failureCodes(result)).toContain("updater_configuration_present");
  });

  it("rejects non-universal main and native Mach-O binaries through the injected lipo port", async () => {
    const fixture = await createFixture();
    fixture.ports.readArchitectures.mockImplementation(async (path: string) => {
      fixture.lipoCalls.push(path);
      return path === fixture.executablePath ? ["arm64"] : ["x86_64"];
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(failureCodes(result)).toEqual(
      expect.arrayContaining([
        "main_executable_not_universal",
        "uiohook_native_module_not_universal",
      ]),
    );
    expect(fixture.lipoCalls).toEqual([
      fixture.executablePath,
      fixture.nativePath,
    ]);
  });

  it("returns a safe structured JSON summary for a complete fake bundle", async () => {
    const fixture = await createFixture();
    const output: string[] = [];
    const errors: string[] = [];

    const exitCode = await runCli([fixture.appPath], {
      verify: (appPath) => verifyPackage(appPath, fixture.ports),
      stdout: (line) => output.push(line),
      stderr: (line) => errors.push(line),
    });

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(JSON.parse(output.join("\n"))).toEqual({
      ok: true,
      app: "Kopper.app",
      checks: {
        architectures: ["arm64", "x86_64"],
        asarEntries: 3,
        bundleIdentifier: "com.kopper.app",
        minimumSystemVersion: "14.0",
        nativeModules: 1,
      },
      failures: [],
    });
    expect(output.join("\n")).not.toContain(fixture.appPath);
  });
});
