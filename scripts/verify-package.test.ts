/// <reference types="node" />

import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as packageVerifier from "./verify-package.mjs";

const { runCli, verifyPackage } = packageVerifier;
const { verifySource } = packageVerifier as typeof packageVerifier & {
  verifySource(root?: string): Promise<{
    ok: boolean;
    source: string;
    checks: { files: number };
    failures: Array<{ file: string; rule: string }>;
  }>;
};

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
    "/out/renderer/index.html":
      '<script type="module" src="./assets/index.js"></script>',
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
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function failureCodes(result: Awaited<ReturnType<typeof verifyPackage>>) {
  return result.failures.map((failure) => failure.code);
}

async function createSourceFixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "kopper-source-audit-test-"));
  temporaryDirectories.push(root);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const path = join(root, relativePath);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, content, "utf8");
    }),
  );
  return root;
}

describe("source security auditor", () => {
  it.each([
    [
      "updater",
      'import { autoUpdater } from "electron-updater";',
      "forbidden_import",
    ],
    [
      "updater helper",
      'import updateElectronApp from "update-electron-app";',
      "forbidden_import",
    ],
    [
      "analytics",
      'const analytics = require("posthog-js");',
      "forbidden_import",
    ],
    [
      "generic external URL",
      'import { shell } from "electron"; void shell.openExternal(targetUrl);',
      "unrestricted_external_open",
    ],
    [
      "web security disabled",
      "const options = { webSecurity: false };",
      "insecure_web_preference",
    ],
    [
      "Node enabled",
      "const options = { nodeIntegration: true };",
      "insecure_web_preference",
    ],
    [
      "isolation disabled",
      "const options = { contextIsolation: false };",
      "insecure_web_preference",
    ],
    ["content logging", "console.error(note.body);", "production_console_log"],
  ])("rejects %s in application source", async (_name, source, rule) => {
    const root = await createSourceFixture({ "src/main/unsafe.ts": source });

    const result = await verifySource(root);

    expect(result.ok).toBe(false);
    expect(result.failures).toContainEqual({
      file: "src/main/unsafe.ts",
      rule,
    });
  });

  it.each([
    [
      "dynamic updater template import",
      "void import(`electron-updater`);",
      "forbidden_import",
    ],
    [
      "updater export",
      'export * from "electron-updater/runtime";',
      "forbidden_import",
    ],
    [
      "analytics template require",
      "require(`posthog-js`);",
      "forbidden_import",
    ],
    [
      "aliased Electron shell",
      'import { shell as electronShell } from "electron"; electronShell.openExternal(target);',
      "unrestricted_external_open",
    ],
    [
      "computed external open",
      'import { shell } from "electron"; shell["openExternal"](target);',
      "unrestricted_external_open",
    ],
    [
      "template-computed external open",
      'import { shell } from "electron"; shell[`openExternal`](target);',
      "unrestricted_external_open",
    ],
    [
      "concatenated computed external open",
      'import { shell } from "electron"; shell["open" + "External"](target);',
      "unrestricted_external_open",
    ],
    [
      "identifier-chain computed external open",
      'import { shell } from "electron"; const first = "open"; const method = first + "External"; shell[method](target);',
      "unrestricted_external_open",
    ],
    [
      "unknown computed Electron shell access",
      'import { shell } from "electron"; const method = chooseMethod(); shell[method](target);',
      "unrestricted_external_open",
    ],
    [
      "destructured external open",
      'import { shell } from "electron"; const { openExternal: open } = shell; open(target);',
      "unrestricted_external_open",
    ],
    [
      "computed destructured external open",
      'import { shell } from "electron"; const method = "open" + "External"; const { [method]: open } = shell; open(target);',
      "unrestricted_external_open",
    ],
    [
      "unknown computed destructuring from Electron shell",
      'import { shell } from "electron"; const method = chooseMethod(); const { [method]: open } = shell; open(target);',
      "unrestricted_external_open",
    ],
    [
      "destructuring assignment from Electron shell",
      'import { shell } from "electron"; let open; ({ openExternal: open } = shell); open(target);',
      "unrestricted_external_open",
    ],
    [
      "computed destructuring assignment from Electron shell",
      'import { shell } from "electron"; let open; ({ ["openExternal"]: open } = shell); open(target);',
      "unrestricted_external_open",
    ],
    [
      "concatenated destructuring assignment from Electron shell",
      'import { shell } from "electron"; let open; ({ ["open" + "External"]: open } = shell); open(target);',
      "unrestricted_external_open",
    ],
    [
      "unknown computed destructuring assignment from Electron shell",
      'import { shell } from "electron"; const method = chooseMethod(); let open; ({ [method]: open } = shell); open(target);',
      "unrestricted_external_open",
    ],
    [
      "destructuring assignment from an Electron shell alias",
      'import { shell } from "electron"; const electronShell = shell; let open; ({ openExternal: open } = electronShell); open(target);',
      "unrestricted_external_open",
    ],
    [
      "aliased external open",
      'import { shell } from "electron"; const open = shell.openExternal; open(target);',
      "unrestricted_external_open",
    ],
    [
      "computed console",
      'console["error"](note.body);',
      "production_console_log",
    ],
    ["bare console identifier", "consume(console);", "production_console_log"],
  ])("rejects %s through AST inspection", async (_name, source, rule) => {
    const root = await createSourceFixture({ "src/main/unsafe.ts": source });

    const result = await verifySource(root);

    expect(result.failures).toContainEqual({
      file: "src/main/unsafe.ts",
      rule,
    });
  });

  it.each([
    [
      "comments",
      '// console.error(note.body); shell.openExternal(target); import("electron-updater");',
    ],
    [
      "inert strings",
      'const examples = ["console.error(x)", "shell.openExternal(x)", "import(\\"electron-updater\\")"];',
    ],
    [
      "unrelated nearby import",
      'import safe from "safe-package"; const example = "posthog-js"; void safe;',
    ],
    [
      "unrelated computed expressions",
      'const method = "open" + "External"; theme[method](value); const copy = { [method]: value };',
    ],
    [
      "unknown unrelated computed access",
      "const method = chooseMethod(); theme[method](value);",
    ],
    [
      "unrelated object destructuring assignment",
      "const theme = loadTheme(); let open; ({ openExternal: open } = theme); open(target);",
    ],
  ])("allows %s that are not executable findings", async (_name, source) => {
    const root = await createSourceFixture({ "src/main/safe.ts": source });

    await expect(verifySource(root)).resolves.toMatchObject({
      ok: true,
      failures: [],
    });
  });

  it("rejects a fixed-looking external open without the reviewed named import", async () => {
    const root = await createSourceFixture({
      "src/main/index.ts": [
        'import "./permissions/permissionManager";',
        "const ACCESSIBILITY_SETTINGS_URL = targetUrl;",
        "void shell.openExternal(ACCESSIBILITY_SETTINGS_URL);",
      ].join("\n"),
    });

    const result = await verifySource(root);

    expect(result.failures).toContainEqual({
      file: "src/main/index.ts",
      rule: "unrestricted_external_open",
    });
  });

  it.each([
    [
      "reviewed names",
      'import { shell } from "electron";',
      'import { ACCESSIBILITY_SETTINGS_URL } from "./permissions/permissionManager";',
      "shell.openExternal(ACCESSIBILITY_SETTINGS_URL)",
    ],
    [
      "reviewed import aliases",
      'import { shell as electronShell } from "electron";',
      'import { ACCESSIBILITY_SETTINGS_URL as settingsUrl } from "./permissions/permissionManager";',
      "electronShell.openExternal(settingsUrl)",
    ],
  ])(
    "permits only the fixed Accessibility Settings external-open adapter with %s",
    async (_name, shellImport, urlImport, call) => {
      const root = await createSourceFixture({
        "src/main/index.ts": [
          shellImport,
          urlImport,
          `const adapter = () => ${call};`,
        ].join("\n"),
        "src/main/permissions/permissionManager.ts":
          'export const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";',
      });

      await expect(verifySource(root)).resolves.toMatchObject({
        ok: true,
        failures: [],
      });
    },
  );

  it.each([
    [
      "shadowed shell receiver",
      'import { shell } from "electron";',
      'import { ACCESSIBILITY_SETTINGS_URL } from "./permissions/permissionManager";',
      "const adapter = (shell: { openExternal(value: string): void }) => shell.openExternal(ACCESSIBILITY_SETTINGS_URL);",
    ],
    [
      "shadowed URL argument",
      'import { shell } from "electron";',
      'import { ACCESSIBILITY_SETTINGS_URL } from "./permissions/permissionManager";',
      "const adapter = (ACCESSIBILITY_SETTINGS_URL: string) => shell.openExternal(ACCESSIBILITY_SETTINGS_URL);",
    ],
    [
      "locally aliased shell receiver",
      'import { shell } from "electron";',
      'import { ACCESSIBILITY_SETTINGS_URL } from "./permissions/permissionManager";',
      "const electronShell = shell; electronShell.openExternal(ACCESSIBILITY_SETTINGS_URL);",
    ],
    [
      "Electron path spoof",
      'import { shell } from "electron/runtime";',
      'import { ACCESSIBILITY_SETTINGS_URL } from "./permissions/permissionManager";',
      "shell.openExternal(ACCESSIBILITY_SETTINGS_URL);",
    ],
    [
      "permission module suffix spoof",
      'import { shell } from "electron";',
      'import { ACCESSIBILITY_SETTINGS_URL } from "./spoof/permissions/permissionManager";',
      "shell.openExternal(ACCESSIBILITY_SETTINGS_URL);",
    ],
    [
      "computed reviewed call",
      'import { shell } from "electron";',
      'import { ACCESSIBILITY_SETTINGS_URL } from "./permissions/permissionManager";',
      'shell["openExternal"](ACCESSIBILITY_SETTINGS_URL);',
    ],
  ])("rejects the Accessibility exception when %s", async (_name, ...lines) => {
    const root = await createSourceFixture({
      "src/main/index.ts": lines.join("\n"),
    });

    const result = await verifySource(root);

    expect(result.failures).toContainEqual({
      file: "src/main/index.ts",
      rule: "unrestricted_external_open",
    });
  });

  it.each([
    [
      "the exported deep link changes",
      'export const ACCESSIBILITY_SETTINGS_URL = "https://example.invalid";',
      {},
    ],
    [
      "the exported binding is not const",
      'export let ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";',
      {},
    ],
    [
      "the canonical module re-exports a wrong target",
      'export { ACCESSIBILITY_SETTINGS_URL } from "./other";',
      {
        "src/main/permissions/other.ts":
          'export const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";',
      },
    ],
  ])(
    "rejects the Accessibility exception when %s",
    async (_name, permissionModule, extraFiles) => {
      const root = await createSourceFixture({
        "src/main/index.ts": [
          'import { shell } from "electron";',
          'import { ACCESSIBILITY_SETTINGS_URL } from "./permissions/permissionManager";',
          "shell.openExternal(ACCESSIBILITY_SETTINGS_URL);",
        ].join("\n"),
        "src/main/permissions/permissionManager.ts": permissionModule,
        ...extraFiles,
      });

      const result = await verifySource(root);

      expect(result.failures).toContainEqual({
        file: "src/main/index.ts",
        rule: "unrestricted_external_open",
      });
    },
  );

  it("rejects a fixed constant imported from the wrong target", async () => {
    const root = await createSourceFixture({
      "src/main/index.ts": [
        'import { shell } from "electron";',
        'import { ACCESSIBILITY_SETTINGS_URL } from "./permissions/other";',
        "shell.openExternal(ACCESSIBILITY_SETTINGS_URL);",
      ].join("\n"),
      "src/main/permissions/other.ts":
        'export const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";',
    });

    const result = await verifySource(root);

    expect(result.failures).toContainEqual({
      file: "src/main/index.ts",
      rule: "unrestricted_external_open",
    });
  });

  it("rejects a symlinked permission declaration outside the canonical source root", async () => {
    const root = await createSourceFixture({
      "src/main/index.ts": [
        'import { shell } from "electron";',
        'import { ACCESSIBILITY_SETTINGS_URL } from "./permissions/permissionManager";',
        "shell.openExternal(ACCESSIBILITY_SETTINGS_URL);",
      ].join("\n"),
    });
    const externalRoot = await mkdtemp(
      join(tmpdir(), "kopper-source-audit-external-"),
    );
    temporaryDirectories.push(externalRoot);
    const externalPermissionModule = join(externalRoot, "permissionManager.ts");
    await writeFile(
      externalPermissionModule,
      'export const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";',
      "utf8",
    );
    const permissionDirectory = join(root, "src/main/permissions");
    await mkdir(permissionDirectory, { recursive: true });
    await symlink(
      externalPermissionModule,
      join(permissionDirectory, "permissionManager.ts"),
    );

    const result = await verifySource(root);

    expect(result.failures).toContainEqual({
      file: "src/main/index.ts",
      rule: "unrestricted_external_open",
    });
  });

  it("rejects a local alias of the reviewed imported constant", async () => {
    const root = await createSourceFixture({
      "src/main/index.ts": [
        'import { shell } from "electron";',
        'import { ACCESSIBILITY_SETTINGS_URL } from "./permissions/permissionManager";',
        "const settingsUrl = ACCESSIBILITY_SETTINGS_URL;",
        "shell.openExternal(settingsUrl);",
      ].join("\n"),
      "src/main/permissions/permissionManager.ts":
        'export const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";',
    });

    const result = await verifySource(root);

    expect(result.failures).toContainEqual({
      file: "src/main/index.ts",
      rule: "unrestricted_external_open",
    });
  });

  it.each([
    ["nodeIntegration true", "nodeIntegration: true"],
    ["nodeIntegration dynamic", "nodeIntegration: disabled"],
    ["nodeIntegration shorthand", "nodeIntegration"],
    ["contextIsolation false", "contextIsolation: false"],
    ["contextIsolation dynamic", "contextIsolation: enabled"],
    ["contextIsolation shorthand", "contextIsolation"],
    ["webSecurity false", "webSecurity: false"],
    ["webSecurity dynamic", "webSecurity: enabled"],
    ["webSecurity shorthand", "webSecurity"],
    ["computed nodeIntegration", '["nodeIntegration"]: true'],
    ["computed contextIsolation", "[`contextIsolation`]: false"],
    ["computed webSecurity", '["webSecurity"]: false'],
    ["concatenated nodeIntegration", '["node" + "Integration"]: true'],
    [
      "identifier-chain contextIsolation",
      "[preferencePrefix + preferenceSuffix]: false",
    ],
  ])("rejects unsafe web preference %s", async (_name, property) => {
    const root = await createSourceFixture({
      "src/main/unsafe.ts": `const disabled = false; const enabled = true; const nodeIntegration = false; const contextIsolation = true; const webSecurity = true; const preferencePrefix = "context"; const preferenceSuffix = "Isolation"; const options = { ${property} };`,
    });

    const result = await verifySource(root);

    expect(result.failures).toContainEqual({
      file: "src/main/unsafe.ts",
      rule: "insecure_web_preference",
    });
  });

  it.each([
    [
      "insecure direct preference assignment",
      "const preferences = {}; preferences.nodeIntegration = true;",
    ],
    [
      "insecure concatenated preference assignment",
      'const preferences = {}; preferences["context" + "Isolation"] = false;',
    ],
    [
      "dynamic preference assignment through an alias",
      "const preferences = {}; const alias = preferences; alias.webSecurity = enabled;",
    ],
    [
      "unknown computed key in a webPreferences object",
      "const key = chooseKey(); const options = { webPreferences: { [key]: false } };",
    ],
    [
      "unknown computed key in an aliased webPreferences object",
      "const key = chooseKey(); const preferences = { [key]: false }; const options = { webPreferences: preferences };",
    ],
    [
      "unknown computed write through a webPreferences alias",
      "const key = chooseKey(); const preferences = {}; preferences[key] = false; const options = { webPreferences: preferences };",
    ],
    [
      "dynamic spread in a webPreferences object",
      "const dynamic = loadPreferences(); const options = { webPreferences: { ...dynamic } };",
    ],
    [
      "unknown key in shorthand webPreferences",
      "const key = chooseKey(); const webPreferences = { [key]: false }; const options = { webPreferences }; void options;",
    ],
    [
      "dynamic spread in shorthand webPreferences",
      "const dynamic = loadPreferences(); const webPreferences = { ...dynamic }; const options = { webPreferences }; void options;",
    ],
    [
      "unknown nested property receiver key",
      "const key = chooseKey(); const options = { webPreferences: {} }; options.webPreferences[key] = false;",
    ],
    [
      "unknown nested element receiver key",
      'const key = chooseKey(); const options = { webPreferences: {} }; options["webPreferences"][key] = false;',
    ],
    [
      "unknown key after webPreferences assignment",
      "const key = chooseKey(); const preferences = {}; const options = {}; options.webPreferences = preferences; preferences[key] = false;",
    ],
    [
      "unknown key through a resolved webPreferences alias chain",
      "const key = chooseKey(); const preferences = {}; const first = preferences; const second = first; const options = { webPreferences: second }; preferences[key] = false; void options;",
    ],
    [
      "unknown key through a resolved webPreferences property-name alias",
      'const key = chooseKey(); const preferenceName = "web" + "Preferences"; const preferences = {}; const options = { [preferenceName]: preferences }; preferences[key] = false; void options;',
    ],
    [
      "unknown key through an assigned property-held alias",
      "const key = chooseKey(); const options = { webPreferences: {} }; const holder: { preferences: Record<string, boolean> } = { preferences: {} }; holder.preferences = options.webPreferences; holder.preferences[key] = false;",
    ],
    [
      "unknown key through an object property-held alias",
      "const key = chooseKey(); const options = { webPreferences: {} }; const holder = { preferences: options.webPreferences }; holder.preferences[key] = false;",
    ],
    [
      "unknown key through a nested property-held alias chain",
      "const key = chooseKey(); const options = { webPreferences: {} }; const holder = { nested: { preferences: options.webPreferences } }; const first = holder.nested.preferences; const second = first; second[key] = false;",
    ],
    [
      "unknown key through a static element property-held alias",
      'const key = chooseKey(); const options = { webPreferences: {} }; const holder = { ["preferences"]: options["webPreferences"] }; holder["preferences"][key] = false;',
    ],
    [
      "unresolved assignment destination receiving known preferences",
      "const destination = chooseKey(); const options = { webPreferences: {} }; const holder: Record<string, Record<string, boolean>> = {}; holder[destination] = options.webPreferences;",
    ],
    [
      "unresolved object-property destination receiving known preferences",
      "const destination = chooseKey(); const options = { webPreferences: {} }; const holder = { [destination]: options.webPreferences }; void holder;",
    ],
    [
      "dynamic spread assigned through a property-held alias",
      "const options = { webPreferences: {} }; const holder = { preferences: options.webPreferences }; holder.preferences = { ...loadPreferences() };",
    ],
    [
      "unknown key through a cyclic property-held alias graph",
      "const key = chooseKey(); const options = { webPreferences: {} }; let first: Record<string, boolean>; let second: Record<string, boolean>; first = second; second = first; first = options.webPreferences; second[key] = false;",
    ],
    [
      "unknown key through a const interface receiver alias chain",
      "interface Holder { preferences: Record<string, unknown>; } const key = chooseKey(); const options = { webPreferences: {} }; const securityHolder = {} as Holder; securityHolder.preferences = options.webPreferences; const first = securityHolder; const second = first; second.preferences[key] = value;",
    ],
    [
      "unknown key through a const nested receiver alias",
      "const key = chooseKey(); const options = { webPreferences: {} }; const securityHolder = { nested: { preferences: options.webPreferences } }; const alias = securityHolder.nested; alias.preferences[key] = value;",
    ],
    [
      "unknown key through a class this receiver",
      "class Holder { preferences: Record<string, unknown> = {}; attach(options: { webPreferences: Record<string, unknown> }) { this.preferences = options.webPreferences; } write(key: string) { this.preferences[key] = value; } } void Holder;",
    ],
  ])("rejects %s", async (_name, source) => {
    const root = await createSourceFixture({ "src/main/unsafe.ts": source });

    const result = await verifySource(root);

    expect(result.failures).toContainEqual({
      file: "src/main/unsafe.ts",
      rule: "insecure_web_preference",
    });
  });

  it.each([
    [
      "a wrapped property alias in an ordinary method",
      "class Holder { preferences: Record<string, unknown> = {}; attach(options: { webPreferences: Record<string, unknown> }) { const candidate = (options.webPreferences as Record<string, unknown>); this.preferences = (candidate); } } void Holder;",
    ],
    [
      "a webPreferences parameter alias in an ordinary method",
      "class Holder { preferences: Record<string, unknown> = {}; attach(webPreferences: Record<string, unknown>) { const candidate = webPreferences; this.preferences = (candidate satisfies Record<string, unknown>); } } void Holder;",
    ],
    [
      "known preference provenance in an ordinary method",
      "const preferences = {}; const options = { webPreferences: preferences }; class Holder { preferences: Record<string, unknown> = {}; attach() { this.preferences = preferences; } } void options; void Holder;",
    ],
    [
      "a constructor",
      "class Holder { preferences: Record<string, unknown> = {}; constructor(options: { webPreferences: Record<string, unknown> }) { this.preferences = options.webPreferences; } } void Holder;",
    ],
    [
      "a getter",
      "const preferences = {}; const options = { webPreferences: preferences }; class Holder { preferences: Record<string, unknown> = {}; get stored() { this.preferences = preferences; return this.preferences; } } void options; void Holder;",
    ],
    [
      "a setter",
      "class Holder { preferences: Record<string, unknown> = {}; set stored(webPreferences: Record<string, unknown>) { this.preferences = webPreferences; } } void Holder;",
    ],
    [
      "a class-field arrow",
      "class Holder { preferences: Record<string, unknown> = {}; attach = (options: { webPreferences: Record<string, unknown> }) => { this.preferences = options.webPreferences; }; } void Holder;",
    ],
    [
      "a nested arrow in a method",
      "class Holder { preferences: Record<string, unknown> = {}; attach(options: { webPreferences: Record<string, unknown> }) { const copy = () => { this.preferences = options.webPreferences; }; void copy; } } void Holder;",
    ],
    [
      "a method parameter default",
      "class Holder { preferences: Record<string, unknown> = {}; attach(webPreferences: Record<string, unknown>, copy = (this.preferences = webPreferences)) { void copy; } } void Holder;",
    ],
  ])(
    "rejects class this-property ingress from %s without invocation or a later sink",
    async (_name, source) => {
      const root = await createSourceFixture({ "src/main/unsafe.ts": source });

      const result = await verifySource(root);

      expect(result.failures).toContainEqual({
        file: "src/main/unsafe.ts",
        rule: "insecure_web_preference",
      });
    },
  );

  it.each([
    [
      "a nested regular function with its own this inside a class method",
      "class Holder { preferences: Record<string, unknown> = {}; attach() { function copy(this: { preferences: Record<string, unknown> }, webPreferences: Record<string, unknown>) { this.preferences = webPreferences; } void copy; } } void Holder;",
    ],
    [
      "a static method whose this is the class constructor",
      "class Holder { static preferences: Record<string, unknown> = {}; static attach(webPreferences: Record<string, unknown>) { this.preferences = webPreferences; } } void Holder;",
    ],
    [
      "a static field arrow whose this is the class constructor",
      "class Holder { static preferences: Record<string, unknown> = {}; static attach = (webPreferences: Record<string, unknown>) => { this.preferences = webPreferences; }; } void Holder;",
    ],
    [
      "a static block whose this is the class constructor",
      "const preferences = {}; const options = { webPreferences: preferences }; class Holder { static preferences: Record<string, unknown> = {}; static { this.preferences = preferences; } } void options; void Holder;",
    ],
    [
      "a computed method name to use an enclosing regular function this",
      "function define(this: { preferences: Record<string, unknown> }, webPreferences: Record<string, unknown>) { class Holder { [this.preferences = webPreferences]() {} } return Holder; } void define;",
    ],
    [
      "a computed getter name to use an enclosing regular function this",
      "function define(this: { preferences: Record<string, unknown> }, webPreferences: Record<string, unknown>) { class Holder { get [this.preferences = webPreferences]() { return undefined; } } return Holder; } void define;",
    ],
    [
      "a computed setter name to use an enclosing regular function this",
      "function define(this: { preferences: Record<string, unknown> }, webPreferences: Record<string, unknown>) { class Holder { set [this.preferences = webPreferences](value: unknown) { void value; } } return Holder; } void define;",
    ],
    [
      "a computed property name to use an enclosing regular function this",
      "function define(this: { preferences: Record<string, unknown> }, webPreferences: Record<string, unknown>) { class Holder { [this.preferences = webPreferences] = undefined; } return Holder; } void define;",
    ],
    [
      "a method decorator to use an enclosing regular function this",
      "function define(this: { preferences: Record<string, unknown> }, webPreferences: Record<string, unknown>) { class Holder { @(this.preferences = webPreferences) attach() {} } return Holder; } void define;",
    ],
  ])("allows %s", async (_name, source) => {
    const root = await createSourceFixture({ "src/main/safe.ts": source });

    await expect(verifySource(root)).resolves.toMatchObject({
      ok: true,
      failures: [],
    });
  });

  it("keeps this-properties in disconnected classes benign without preference ingress", async () => {
    const root = await createSourceFixture({
      "src/main/safe.ts": [
        "const key = chooseKey();",
        "class SecurityHolder { preferences: Record<string, unknown> = {}; attach(candidate: Record<string, unknown>) { this.preferences = candidate; } }",
        "class ThemeHolder { preferences: Record<string, unknown> = {}; write() { this.preferences[key] = value; } }",
        "void SecurityHolder; void ThemeHolder;",
      ].join("\n"),
    });

    await expect(verifySource(root)).resolves.toMatchObject({
      ok: true,
      failures: [],
    });
  });

  it("allows literal-safe web preference objects, assignments, and proven spreads", async () => {
    const root = await createSourceFixture({
      "src/main/safe.ts": [
        "const one = { nodeIntegration: false, contextIsolation: true, webSecurity: true };",
        'const two = { ["nodeIntegration"]: false, [`contextIsolation`]: true };',
        "const preferences = {}; preferences.nodeIntegration = false; preferences.contextIsolation = true; preferences.webSecurity = true;",
        "const defaults = { nodeIntegration: false }; const options = { webPreferences: { ...defaults, contextIsolation: true } };",
        "const webPreferences = { nodeIntegration: false, contextIsolation: true, webSecurity: true }; const shorthand = { webPreferences };",
        'options.webPreferences["nodeIntegration"] = false; options["webPreferences"].contextIsolation = true;',
        "void one; void two; void options; void shorthand;",
      ].join("\n"),
    });

    await expect(verifySource(root)).resolves.toMatchObject({
      ok: true,
      failures: [],
    });
  });

  it("does not treat unrelated computed theme keys or spreads as web preferences", async () => {
    const root = await createSourceFixture({
      "src/main/safe.ts":
        "const key = chooseKey(); const palette = loadPalette(); const theme = { [key]: value, ...palette }; theme[key] = nextValue; void theme;",
    });

    await expect(verifySource(root)).resolves.toMatchObject({
      ok: true,
      failures: [],
    });
  });

  it("preserves property-held aliases, cycles, and spreads for benign theme data", async () => {
    const root = await createSourceFixture({
      "src/main/safe.ts": [
        "const key = chooseKey(); const palette = loadPalette(); const theme = { colors: {} };",
        "const assigned: { preferences: Record<string, unknown> } = { preferences: {} }; assigned.preferences = theme.colors; assigned.preferences[key] = value;",
        "const nested = { inner: { preferences: theme.colors } }; const alias = nested.inner.preferences; alias[key] = value;",
        'const element = { ["preferences"]: theme.colors }; element["preferences"][key] = value;',
        "let first: Record<string, unknown>; let second: Record<string, unknown>; first = second; second = first; first = theme.colors; second[key] = value;",
        "const spread = { ...assigned.preferences, ...palette }; void spread;",
      ].join("\n"),
    });

    await expect(verifySource(root)).resolves.toMatchObject({
      ok: true,
      failures: [],
    });
  });

  it.each([
    [
      "interface property",
      "interface Holder { preferences: Record<string, unknown>; } const securityHolder = {} as Holder; const themeHolder = {} as Holder;",
    ],
    [
      "class property",
      "class Holder { preferences: Record<string, unknown> = {}; } const securityHolder = new Holder(); const themeHolder = new Holder();",
    ],
  ])(
    "keeps separate receiver instances isolated for a shared %s symbol",
    async (_name, declarations) => {
      const root = await createSourceFixture({
        "src/main/safe.ts": [
          "const key = chooseKey(); const options = { webPreferences: {} };",
          declarations,
          "securityHolder.preferences = options.webPreferences;",
          "themeHolder.preferences[key] = value;",
        ].join("\n"),
      });

      await expect(verifySource(root)).resolves.toMatchObject({
        ok: true,
        failures: [],
      });
    },
  );

  it("scans application source only and treats tests as negative fixture data", async () => {
    const unsafe =
      'import updater from "electron-updater"; console.log(noteBody);';
    const root = await createSourceFixture({
      "src/main/safe.ts": "export const safe = true;",
      "src/main/safe.test.ts": unsafe,
      "src/main/__fixtures__/unsafe.ts": unsafe,
      "scripts/generated.mjs": unsafe,
      "out/main/index.js": unsafe,
      "release/app/index.js": unsafe,
      "node_modules/example/index.js": unsafe,
    });

    await expect(verifySource(root)).resolves.toMatchObject({
      ok: true,
      checks: { files: 1 },
      failures: [],
    });
  });

  it("reports only file and rule names without matched user, credential, or native-error values", async () => {
    const secret = "private-note-clipboard-import-credential-native-error";
    const root = await createSourceFixture({
      "src/preload/unsafe.ts": `console.log(${JSON.stringify(secret)});`,
    });

    const result = await verifySource(root);

    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.failures).toEqual([
      { file: "src/preload/unsafe.ts", rule: "production_console_log" },
    ]);
  });

  it("supports the --source CLI mode with safe structured output", async () => {
    const output: string[] = [];
    const errors: string[] = [];

    const sourcePorts = {
      verifySource: async () => ({
        ok: true,
        source: "src",
        checks: { files: 42 },
        failures: [],
      }),
      stdout: (line: string) => output.push(line),
      stderr: (line: string) => errors.push(line),
    };
    const exitCode = await runCli(
      ["--source"],
      sourcePorts as unknown as Parameters<typeof runCli>[1],
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(JSON.parse(output.join("\n"))).toMatchObject({
      ok: true,
      source: "src",
      checks: { files: 42 },
    });
  });
});

describe("package verifier", () => {
  it.each([
    ["CFBundleIdentifier", "wrong.identifier", "invalid_bundle_identifier"],
    ["LSMinimumSystemVersion", "13.0", "invalid_minimum_system_version"],
    [
      "NSAppleEventsUsageDescription",
      undefined,
      "missing_apple_events_usage_description",
    ],
  ])("rejects invalid %s metadata", async (key, value, code) => {
    const fixture = await createFixture({ info: { [key]: value } });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(result.ok).toBe(false);
    expect(failureCodes(result)).toContain(code);
  });

  it.each([
    [
      "double-quoted HTML script",
      '<script src="https://cdn.example.invalid/remote.js"></script>',
    ],
    [
      "single-quoted HTML script",
      "<script src='http://cdn.example.invalid/remote.js'></script>",
    ],
    [
      "unquoted HTML script",
      "<script defer src=https://cdn.example.invalid/remote.js></script>",
    ],
    [
      "single-quoted dynamic import",
      "void import('https://cdn.example.invalid/module.js')",
    ],
    [
      "double-quoted dynamic import",
      'void import("http://cdn.example.invalid/module.js")',
    ],
    [
      "template dynamic import",
      "void import(`https://cdn.example.invalid/module.js`)",
    ],
    [
      "commented dynamic import",
      "void import /* webpackIgnore: true */ ('https://cdn.example.invalid/module.js')",
    ],
    [
      "interpolated remote-prefix dynamic import",
      "void import(`https://cdn.example.invalid/${moduleName}.js`)",
    ],
    [
      "single-quoted importScripts",
      "importScripts('https://cdn.example.invalid/worker.js')",
    ],
    [
      "double-quoted importScripts",
      'importScripts("http://cdn.example.invalid/worker.js")',
    ],
    [
      "template importScripts",
      "importScripts(`https://cdn.example.invalid/worker.js`)",
    ],
    [
      "later importScripts argument",
      "self.importScripts('./local.js', /* fallback */ 'https://cdn.example.invalid/worker.js')",
    ],
    [
      "static side-effect import",
      "import 'https://cdn.example.invalid/module.js'",
    ],
    [
      "commented static import-from",
      "import remote /* binding */ from /* source */ 'https://cdn.example.invalid/module.js'",
    ],
    [
      "static export-from",
      "export { remote } from 'https://cdn.example.invalid/module.js'",
    ],
    [
      "static export-all",
      "export * from 'https://cdn.example.invalid/module.js'",
    ],
  ])("rejects a %s remote renderer source", async (name, content) => {
    const entry = name.includes("HTML")
      ? "/out/renderer/index.html"
      : "/out/renderer/assets/index.js";
    const fixture = await createFixture({
      asarFiles: { [entry]: content },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(failureCodes(result)).toContain("remote_renderer_script_source");
  });

  it.each([
    [
      "commented examples",
      [
        "// void import('https://cdn.example.invalid/example.js')",
        "/* importScripts('https://cdn.example.invalid/example.js') */",
      ].join("\n"),
    ],
    [
      "static example strings",
      [
        "const dynamicExample = \"import('https://cdn.example.invalid/example.js')\";",
        "const workerExample = \"importScripts('http://cdn.example.invalid/example.js')\";",
      ].join("\n"),
    ],
  ])("allows %s in renderer JavaScript", async (_name, content) => {
    const fixture = await createFixture({
      asarFiles: { "/out/renderer/assets/index.js": content },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(result.ok).toBe(true);
    expect(failureCodes(result)).not.toContain("remote_renderer_script_source");
  });

  it("rejects a real remote script after a comment marker in an attribute", async () => {
    const fixture = await createFixture({
      asarFiles: {
        "/out/renderer/index.html":
          '<div data-example="<!--"></div><script src="https://cdn.example.invalid/remote.js"></script>',
      },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(failureCodes(result)).toContain("remote_renderer_script_source");
  });

  it("rejects an entity-decoded remote script source", async () => {
    const fixture = await createFixture({
      asarFiles: {
        "/out/renderer/index.html":
          '<script src="https&#58;//cdn.example.invalid/remote.js"></script>',
      },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(failureCodes(result)).toContain("remote_renderer_script_source");
  });

  it("ignores a truly commented remote script independently", async () => {
    const fixture = await createFixture({
      asarFiles: {
        "/out/renderer/index.html":
          "<!-- <script src=https://cdn.example.invalid/commented.js></script> -->",
      },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(result.ok).toBe(true);
    expect(failureCodes(result)).not.toContain("remote_renderer_script_source");
  });

  it.each([
    [
      "remote script source inside a template",
      '<template><script src="https://cdn.example.invalid/template.js"></script></template>',
    ],
    [
      "remote inline dynamic import inside a template",
      '<template><script>void import("https://cdn.example.invalid/template.js")</script></template>',
    ],
    [
      "remote script source inside nested templates",
      '<template><div><template><script src="https://cdn.example.invalid/nested-template.js"></script></template></div></template>',
    ],
  ])("rejects a %s", async (_name, content) => {
    const fixture = await createFixture({
      asarFiles: { "/out/renderer/index.html": content },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(failureCodes(result)).toContain("remote_renderer_script_source");
  });

  it("allows benign comments, URLs, and inert scripts inside templates", async () => {
    const fixture = await createFixture({
      asarFiles: {
        "/out/renderer/index.html": [
          "<template><template>",
          "<!-- <script src=https://cdn.example.invalid/commented.js></script> -->",
          '<script type="application/ld+json" src="https&#58;//cdn.example.invalid/data.json">',
          '{"example":"import(\\"https://cdn.example.invalid/example.js\\")"}',
          "</script>",
          '<a href="https://docs.example.invalid/help">Help</a>',
          '<script>const example = "https://cdn.example.invalid/example.js"</script>',
          "</template></template>",
        ].join(""),
      },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(result.ok).toBe(true);
    expect(failureCodes(result)).not.toContain("remote_renderer_script_source");
  });

  it("allows an inert JSON-LD script with a remote src and remote-looking content", async () => {
    const fixture = await createFixture({
      asarFiles: {
        "/out/renderer/index.html": [
          '<script type="application/ld+json" src="https://cdn.example.invalid/data.json">',
          '{"example":"import(\\"https://cdn.example.invalid/example.js\\")"}',
          "</script>",
        ].join(""),
      },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(result.ok).toBe(true);
    expect(failureCodes(result)).not.toContain("remote_renderer_script_source");
  });

  it.each([
    ["classic script without a type", "<script>"],
    ["classic script with an empty type", '<script type="">'],
    [
      "classic script with a JavaScript MIME type",
      '<script type="text/javascript; charset=utf-8">',
    ],
    ["classic script with a legacy type", '<script type="text/jscript">'],
    ["module script", '<script type="MODULE">'],
  ])(
    "rejects remote inline imports in an executable %s",
    async (_name, tag) => {
      const fixture = await createFixture({
        asarFiles: {
          "/out/renderer/index.html": `${tag}void import("https://cdn.example.invalid/inline.js")</script>`,
        },
      });

      const result = await verifyPackage(fixture.appPath, fixture.ports);

      expect(failureCodes(result)).toContain("remote_renderer_script_source");
    },
  );

  it("allows benign entity and comment markers in attributes", async () => {
    const fixture = await createFixture({
      asarFiles: {
        "/out/renderer/index.html": [
          '<div data-example="<!--" data-url="https&#58;//docs.example.invalid"></div>',
          '<script data-example="<!--" data-url="https&#58;//docs.example.invalid">',
          "console.log('local renderer')",
          "</script>",
        ].join(""),
      },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(result.ok).toBe(true);
    expect(failureCodes(result)).not.toContain("remote_renderer_script_source");
  });

  it("parses executable inline scripts but ignores HTML comments and inert script data", async () => {
    const fixture = await createFixture({
      asarFiles: {
        "/out/renderer/index.html": [
          "<!-- <script src=https://cdn.example.invalid/commented.js></script> -->",
          '<script type="application/ld+json">',
          '{"@context":"https://schema.org","example":"import(\\"https://cdn.example.invalid/example.js\\")"}',
          "</script>",
          "<script>void import /* comment */ ('https://cdn.example.invalid/inline.js')</script>",
        ].join(""),
      },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(failureCodes(result)).toContain("remote_renderer_script_source");
  });

  it("allows benign non-script HTTP and HTTPS document URLs", async () => {
    const fixture = await createFixture({
      asarFiles: {
        "/out/renderer/index.html": [
          "<!-- import('https://cdn.example.invalid/example.js') -->",
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

  it("falls back from module parsing for valid classic scripts", async () => {
    const fixture = await createFixture({
      asarFiles: {
        "/out/renderer/assets/index.js":
          "with ({ localValue: 1 }) { console.log(localValue) }",
      },
    });

    const result = await verifyPackage(fixture.appPath, fixture.ports);

    expect(result.ok).toBe(true);
  });

  it.each([
    [
      "standalone renderer JavaScript",
      "/out/renderer/assets/index.js",
      "const = broken syntax",
    ],
    [
      "inline renderer JavaScript",
      "/out/renderer/index.html",
      "<script>const = broken syntax</script>",
    ],
  ])(
    "returns a structured failure for invalid %s",
    async (_name, entry, content) => {
      const fixture = await createFixture({
        asarFiles: { [entry]: content },
      });

      const result = await verifyPackage(fixture.appPath, fixture.ports);

      expect(result.ok).toBe(false);
      expect(result.failures).toContainEqual({
        code: "invalid_renderer_javascript",
        message: "A renderer JavaScript source could not be parsed.",
      });
    },
  );

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
