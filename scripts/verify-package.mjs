#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { extractFile, listPackage } from "@electron/asar";
import { parse as parseJavaScriptAst } from "acorn";
import { parse as parseHtmlDocument } from "parse5";
import * as ts from "typescript/unstable/ast";
import { API as TypeScriptApi } from "typescript/unstable/sync";

const execFile = promisify(execFileCallback);
const REQUIRED_ARCHITECTURES = ["arm64", "x86_64"];
const APPLE_EVENTS_DESCRIPTION =
  "Kopper uses System Events only when you invoke capture, so it can copy the text you selected.";

async function readInfoPlist(plistPath) {
  const { stdout } = await execFile(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", plistPath],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function listAsarEntries(asarPath) {
  return listPackage(asarPath);
}

async function readAsarEntry(asarPath, entry) {
  return extractFile(asarPath, entry.replace(/^\//, ""));
}

async function findFiles(root, predicate) {
  const matches = [];
  const visit = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && predicate(entry.name, path))
        matches.push(path);
    }
  };
  await visit(root);
  return matches.sort();
}

async function findNativeBinaries(uiohookPath) {
  const binaries = await findFiles(
    uiohookPath,
    (name) => name === "uiohook_napi.node",
  );
  const runtimeBinary = binaries.find((path) =>
    path.endsWith(`${sep}build${sep}Release${sep}uiohook_napi.node`),
  );
  return runtimeBinary ? [runtimeBinary] : binaries.slice(0, 1);
}

async function findUpdaterConfigurations(resourcesPath) {
  const names = [
    "app-update.yml",
    "app-update.yaml",
    "dev-app-update.yml",
    "dev-app-update.yaml",
  ];
  const present = [];
  for (const name of names) {
    try {
      await access(join(resourcesPath, name));
      present.push(name);
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
  }
  return present;
}

async function readArchitectures(binaryPath) {
  const { stdout } = await execFile("/usr/bin/lipo", ["-archs", binaryPath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024,
  });
  return stdout.trim().split(/\s+/).filter(Boolean);
}

const defaultPorts = {
  readInfoPlist,
  listAsarEntries,
  readAsarEntry,
  findNativeBinaries,
  findUpdaterConfigurations,
  readArchitectures,
};

function hasRequiredArchitectures(architectures) {
  return REQUIRED_ARCHITECTURES.every((architecture) =>
    architectures.includes(architecture),
  );
}

const REMOTE_URL = /^https?:\/\//iu;
const JAVASCRIPT_TYPES = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "module",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);

function staticStringStartsWithRemoteUrl(node) {
  if (node?.type === "Literal" && typeof node.value === "string") {
    return REMOTE_URL.test(node.value);
  }
  if (node?.type !== "TemplateLiteral" || node.quasis.length === 0) {
    return false;
  }
  const firstQuasi = node.quasis[0].value;
  return REMOTE_URL.test(firstQuasi.cooked ?? firstQuasi.raw);
}

function parseJavaScript(content) {
  const options = { ecmaVersion: "latest", allowHashBang: true };
  try {
    return parseJavaScriptAst(content, { ...options, sourceType: "module" });
  } catch {
    try {
      return parseJavaScriptAst(content, {
        ...options,
        sourceType: "script",
      });
    } catch {
      return null;
    }
  }
}

function isImportScriptsCall(node) {
  if (node.type !== "CallExpression") return false;
  if (node.callee?.type === "Identifier") {
    return node.callee.name === "importScripts";
  }
  return (
    node.callee?.type === "MemberExpression" &&
    ((node.callee.computed &&
      node.callee.property?.type === "Literal" &&
      node.callee.property.value === "importScripts") ||
      (!node.callee.computed &&
        node.callee.property?.type === "Identifier" &&
        node.callee.property.name === "importScripts"))
  );
}

function inspectJavaScript(content) {
  const tree = parseJavaScript(content);
  if (!tree) return { parseError: true, remote: false };

  const stack = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;

    if (
      (node.type === "ImportExpression" &&
        staticStringStartsWithRemoteUrl(node.source)) ||
      ((node.type === "ImportDeclaration" ||
        node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration") &&
        staticStringStartsWithRemoteUrl(node.source)) ||
      (isImportScriptsCall(node) &&
        node.arguments.some(staticStringStartsWithRemoteUrl))
    ) {
      return { parseError: false, remote: true };
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === "object") stack.push(value);
    }
  }

  return { parseError: false, remote: false };
}

function executableScript(attributes) {
  if (!attributes.has("type")) return true;

  const type = attributes.get("type").trim().toLowerCase();
  if (type === "" || type === "module") return true;

  const mimeType = type.split(";", 1)[0].trim();
  return JAVASCRIPT_TYPES.has(mimeType);
}

function inspectHtml(content) {
  let document;
  try {
    document = parseHtmlDocument(content);
  } catch {
    return { parseError: true, remote: false };
  }

  const stack = [...document.childNodes];
  const visited = new Set();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || visited.has(node)) continue;
    visited.add(node);

    if (node.tagName === "script") {
      const attributes = new Map(
        node.attrs.map((attribute) => [attribute.name, attribute.value]),
      );
      if (!executableScript(attributes)) continue;

      if (attributes.has("src")) {
        if (REMOTE_URL.test(attributes.get("src").trim())) {
          return { parseError: false, remote: true };
        }
        continue;
      }

      const script = node.childNodes
        .filter((child) => child.nodeName === "#text")
        .map((child) => child.value)
        .join("");
      const result = inspectJavaScript(script);
      if (result.remote || result.parseError) return result;
      continue;
    }

    if (Array.isArray(node.childNodes)) stack.push(...node.childNodes);
    if (node.tagName === "template" && node.content) {
      stack.push(node.content);
    }
  }
  return { parseError: false, remote: false };
}

function inspectRendererSource(entry, content) {
  return entry.toLowerCase().endsWith(".html")
    ? inspectHtml(content)
    : inspectJavaScript(content);
}

function updaterEntries(entries) {
  const lowered = entries.map((entry) => entry.toLowerCase());
  return {
    packagePresent: lowered.some(
      (entry) =>
        entry.includes("/node_modules/electron-updater/") ||
        entry.endsWith("/node_modules/electron-updater"),
    ),
    configurationPresent: lowered.some((entry) =>
      /\/(?:dev-)?app-update\.ya?ml$/u.test(entry),
    ),
  };
}

function failure(code, message) {
  return { code, message };
}

const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const FORBIDDEN_IMPORTS = new Set([
  "electron-updater",
  "update-electron-app",
  "@sentry/electron",
  "@sentry/browser",
  "@segment/analytics-node",
  "@segment/analytics-next",
  "@amplitude/analytics-browser",
  "@google-analytics/data",
  "@vercel/analytics",
  "amplitude-js",
  "analytics",
  "analytics-node",
  "mixpanel",
  "plausible-tracker",
  "posthog-js",
  "rudder-sdk-js",
]);
const SECURE_WEB_PREFERENCES = new Map([
  ["nodeIntegration", ts.SyntaxKind.FalseKeyword],
  ["contextIsolation", ts.SyntaxKind.TrueKeyword],
  ["webSecurity", ts.SyntaxKind.TrueKeyword],
]);

function forbiddenImport(moduleName) {
  return [...FORBIDDEN_IMPORTS].some(
    (forbidden) =>
      moduleName === forbidden || moduleName.startsWith(`${forbidden}/`),
  );
}

function staticString(node, checker, seenSymbols = new Set()) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const expression = staticString(span.expression, checker, seenSymbols);
      if (expression === undefined) return undefined;
      value += expression + span.literal.text;
    }
    return value;
  }
  if (ts.isParenthesizedExpression(node)) {
    return staticString(node.expression, checker, seenSymbols);
  }
  if (!ts.isIdentifier(node)) return undefined;

  const symbol = checker.getSymbolAtLocation(node);
  if (symbol === undefined || seenSymbols.has(symbol.id)) return undefined;
  seenSymbols.add(symbol.id);
  for (const declarationHandle of symbol.declarations) {
    const declaration = declarationHandle.resolve();
    if (
      declaration &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer
    ) {
      return staticString(declaration.initializer, checker, seenSymbols);
    }
  }
  return undefined;
}

function propertyNameText(name, checker) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    return staticString(name.expression, checker);
  }
  return undefined;
}

function importedBinding(symbol, importedName, moduleName) {
  if (symbol === undefined) return false;
  return symbol.declarations.some((handle) => {
    const declaration = handle.resolve();
    if (!declaration || !ts.isImportSpecifier(declaration)) return false;
    const sourceName = declaration.propertyName?.text ?? declaration.name.text;
    const importDeclaration = declaration.parent?.parent?.parent;
    return (
      sourceName === importedName &&
      importDeclaration &&
      ts.isImportDeclaration(importDeclaration) &&
      ts.isStringLiteral(importDeclaration.moduleSpecifier) &&
      importDeclaration.moduleSpecifier.text === moduleName
    );
  });
}

function reviewedExternalOpen(relativePath, propertyAccess, checker) {
  if (relativePath !== "src/main/index.ts") return false;
  if (!ts.isIdentifier(propertyAccess.expression)) return false;
  const call = propertyAccess.parent;
  if (
    !ts.isCallExpression(call) ||
    call.expression !== propertyAccess ||
    call.arguments.length !== 1 ||
    !ts.isIdentifier(call.arguments[0])
  ) {
    return false;
  }
  return (
    importedBinding(
      checker.getSymbolAtLocation(propertyAccess.expression),
      "shell",
      "electron",
    ) &&
    importedBinding(
      checker.getSymbolAtLocation(call.arguments[0]),
      "ACCESSIBILITY_SETTINGS_URL",
      "./permissions/permissionManager",
    )
  );
}

function moduleReference(node, checker) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return node.moduleSpecifier
      ? staticString(node.moduleSpecifier, checker)
      : undefined;
  }
  if (ts.isExternalModuleReference(node)) {
    return staticString(node.expression, checker);
  }
  if (!ts.isCallExpression(node) || node.arguments.length === 0) {
    return undefined;
  }
  const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  const commonJsRequire =
    ts.isIdentifier(node.expression) && node.expression.text === "require";
  if (!dynamicImport && !commonJsRequire) return undefined;
  return staticString(node.arguments[0], checker);
}

function hasUnsafeWebPreference(objectLiteral, checker) {
  for (const property of objectLiteral.properties) {
    if (!property.name) continue;
    const name = propertyNameText(property.name, checker);
    const expected = SECURE_WEB_PREFERENCES.get(name);
    if (expected === undefined) continue;
    if (
      !ts.isPropertyAssignment(property) ||
      property.initializer.kind !== expected
    ) {
      return true;
    }
  }
  return false;
}

function inspectApplicationSource(relativePath, sourceFile, checker) {
  const rules = new Set();

  const visit = (node) => {
    const importedModule = moduleReference(node, checker);
    if (importedModule !== undefined && forbiddenImport(importedModule)) {
      rules.add("forbidden_import");
    }

    if (ts.isIdentifier(node) && node.text === "console") {
      rules.add("production_console_log");
    }

    if (
      ts.isObjectLiteralExpression(node) &&
      hasUnsafeWebPreference(node, checker)
    ) {
      rules.add("insecure_web_preference");
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "openExternal"
    ) {
      if (!reviewedExternalOpen(relativePath, node, checker)) {
        rules.add("unrestricted_external_open");
      }
    } else if (
      ts.isElementAccessExpression(node) &&
      staticString(node.argumentExpression, checker) === "openExternal"
    ) {
      rules.add("unrestricted_external_open");
    } else if (
      ts.isComputedPropertyName(node) &&
      staticString(node.expression, checker) === "openExternal"
    ) {
      rules.add("unrestricted_external_open");
    } else if (ts.isIdentifier(node) && node.text === "openExternal") {
      const property = node.parent;
      if (
        !ts.isPropertyAccessExpression(property) ||
        property.name !== node ||
        !reviewedExternalOpen(relativePath, property, checker)
      ) {
        rules.add("unrestricted_external_open");
      }
    }

    node.forEachChild(visit);
  };
  visit(sourceFile);
  return [...rules].sort();
}

function applicationSourcePath(path) {
  const normalized = path.split(sep).join("/");
  return (
    SOURCE_EXTENSIONS.test(normalized) &&
    !/\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(normalized) &&
    !normalized.split("/").includes("__fixtures__")
  );
}

export async function verifySource(root = process.cwd()) {
  const absoluteRoot = resolve(root);
  const sourceRoot = join(absoluteRoot, "src");
  const files = await findFiles(sourceRoot, (_name, path) =>
    applicationSourcePath(path),
  );
  const failures = [];
  const api = new TypeScriptApi();
  let snapshot;
  try {
    snapshot = api.updateSnapshot({ openFiles: files });
    for (const path of files) {
      const relativePath = relative(absoluteRoot, path).split(sep).join("/");
      const project = snapshot.getDefaultProjectForFile(path);
      const sourceFile = project?.program.getSourceFile(path);
      if (project === undefined || sourceFile === undefined) {
        failures.push({ file: relativePath, rule: "source_audit_failed" });
        continue;
      }
      if (project.program.getSyntacticDiagnostics(path).length > 0) {
        failures.push({ file: relativePath, rule: "invalid_source_syntax" });
        continue;
      }
      for (const rule of inspectApplicationSource(
        relativePath,
        sourceFile,
        project.checker,
      )) {
        failures.push({ file: relativePath, rule });
      }
    }
  } finally {
    snapshot?.dispose();
    api.close();
  }
  return {
    ok: failures.length === 0,
    source: "src",
    checks: { files: files.length },
    failures,
  };
}

export async function verifyPackage(appPath, injectedPorts = {}) {
  const ports = { ...defaultPorts, ...injectedPorts };
  const absoluteAppPath = resolve(appPath);
  const contentsPath = join(absoluteAppPath, "Contents");
  const resourcesPath = join(contentsPath, "Resources");
  const asarPath = join(resourcesPath, "app.asar");
  const failures = [];
  let info = {};
  let entries = [];
  let nativeBinaries = [];
  let updaterConfigurations = [];
  let mainArchitectures = [];

  try {
    info = await ports.readInfoPlist(join(contentsPath, "Info.plist"));
  } catch {
    failures.push(
      failure(
        "unreadable_info_plist",
        "Info.plist could not be read with plutil.",
      ),
    );
  }

  if (info.CFBundleIdentifier !== "com.kopper.app") {
    failures.push(
      failure(
        "invalid_bundle_identifier",
        "CFBundleIdentifier must be com.kopper.app.",
      ),
    );
  }
  if (info.LSMinimumSystemVersion !== "14.0") {
    failures.push(
      failure(
        "invalid_minimum_system_version",
        "LSMinimumSystemVersion must be 14.0.",
      ),
    );
  }
  if (
    typeof info.NSAppleEventsUsageDescription !== "string" ||
    info.NSAppleEventsUsageDescription.trim().length === 0
  ) {
    failures.push(
      failure(
        "missing_apple_events_usage_description",
        "NSAppleEventsUsageDescription must be present.",
      ),
    );
  }

  try {
    entries = await ports.listAsarEntries(asarPath);
  } catch {
    failures.push(
      failure(
        "unreadable_asar",
        "The packaged application ASAR could not be listed.",
      ),
    );
  }

  const updater = updaterEntries(entries);
  try {
    updaterConfigurations =
      await ports.findUpdaterConfigurations(resourcesPath);
  } catch {
    failures.push(
      failure(
        "unreadable_updater_configuration",
        "Updater configuration presence could not be verified.",
      ),
    );
  }
  if (updater.packagePresent) {
    failures.push(
      failure(
        "updater_package_present",
        "An automatic updater package is present.",
      ),
    );
  }
  if (updater.configurationPresent || updaterConfigurations.length > 0) {
    failures.push(
      failure(
        "updater_configuration_present",
        "An automatic updater configuration is present.",
      ),
    );
  }

  const rendererEntries = entries.filter((entry) =>
    /^\/out\/renderer\/.*\.(?:c?js|mjs|html)$/iu.test(entry),
  );
  for (const entry of rendererEntries) {
    try {
      const content = (await ports.readAsarEntry(asarPath, entry)).toString(
        "utf8",
      );
      const inspection = inspectRendererSource(entry, content);
      if (inspection.parseError) {
        failures.push(
          failure(
            "invalid_renderer_javascript",
            "A renderer JavaScript source could not be parsed.",
          ),
        );
        break;
      }
      if (inspection.remote) {
        failures.push(
          failure(
            "remote_renderer_script_source",
            "A renderer file references a remote script source.",
          ),
        );
        break;
      }
    } catch {
      failures.push(
        failure(
          "unreadable_renderer_entry",
          "A renderer entry could not be read from the application ASAR.",
        ),
      );
      break;
    }
  }

  const uiohookPath = join(
    resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "uiohook-napi",
  );
  try {
    nativeBinaries = await ports.findNativeBinaries(uiohookPath);
  } catch {
    nativeBinaries = [];
  }
  if (nativeBinaries.length === 0) {
    failures.push(
      failure(
        "missing_uiohook_native_module",
        "The unpacked uiohook native module is missing.",
      ),
    );
  }

  const executableName =
    typeof info.CFBundleExecutable === "string" ? info.CFBundleExecutable : "";
  if (executableName.length === 0 || executableName.includes(sep)) {
    failures.push(
      failure(
        "missing_main_executable",
        "CFBundleExecutable does not identify a safe main executable.",
      ),
    );
  } else {
    try {
      mainArchitectures = await ports.readArchitectures(
        join(contentsPath, "MacOS", executableName),
      );
      if (!hasRequiredArchitectures(mainArchitectures)) {
        failures.push(
          failure(
            "main_executable_not_universal",
            "The main executable must contain arm64 and x86_64 slices.",
          ),
        );
      }
    } catch {
      failures.push(
        failure(
          "main_executable_not_universal",
          "The main executable architecture could not be verified.",
        ),
      );
    }
  }

  if (nativeBinaries.length > 0) {
    try {
      const nativeArchitectures = await ports.readArchitectures(
        nativeBinaries[0],
      );
      if (!hasRequiredArchitectures(nativeArchitectures)) {
        failures.push(
          failure(
            "uiohook_native_module_not_universal",
            "The uiohook native module must contain arm64 and x86_64 slices.",
          ),
        );
      }
    } catch {
      failures.push(
        failure(
          "uiohook_native_module_not_universal",
          "The uiohook native module architecture could not be verified.",
        ),
      );
    }
  }

  return {
    ok: failures.length === 0,
    app: basename(absoluteAppPath),
    checks: {
      architectures: hasRequiredArchitectures(mainArchitectures)
        ? REQUIRED_ARCHITECTURES
        : mainArchitectures,
      asarEntries: entries.length,
      bundleIdentifier:
        typeof info.CFBundleIdentifier === "string"
          ? info.CFBundleIdentifier
          : null,
      minimumSystemVersion:
        typeof info.LSMinimumSystemVersion === "string"
          ? info.LSMinimumSystemVersion
          : null,
      nativeModules: nativeBinaries.length,
    },
    failures,
  };
}

export async function runCli(args, injectedPorts = {}) {
  const ports = {
    verify: verifyPackage,
    verifySource,
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
    ...injectedPorts,
  };

  if (args.length === 1 && args[0] === "--source") {
    try {
      const result = await ports.verifySource();
      const output = JSON.stringify(result, null, 2);
      if (result.ok) ports.stdout(output);
      else ports.stderr(output);
      return result.ok ? 0 : 1;
    } catch {
      ports.stderr(
        JSON.stringify({
          ok: false,
          source: "src",
          checks: null,
          failures: [{ file: "src", rule: "source_audit_failed" }],
        }),
      );
      return 1;
    }
  }

  if (args.length !== 1 || !args[0].endsWith(".app")) {
    ports.stderr(
      JSON.stringify({
        ok: false,
        app: null,
        checks: null,
        failures: [
          failure(
            "invalid_arguments",
            "Usage: verify-package.mjs <path-to-application.app> | --source",
          ),
        ],
      }),
    );
    return 1;
  }

  try {
    const result = await ports.verify(args[0]);
    const output = JSON.stringify(result, null, 2);
    if (result.ok) ports.stdout(output);
    else ports.stderr(output);
    return result.ok ? 0 : 1;
  } catch {
    ports.stderr(
      JSON.stringify({
        ok: false,
        app: basename(args[0]),
        checks: null,
        failures: [
          failure("verification_failed", "Package verification failed."),
        ],
      }),
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = await runCli(process.argv.slice(2));
}

export { APPLE_EVENTS_DESCRIPTION };
