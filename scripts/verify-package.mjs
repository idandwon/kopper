#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { extractFile, listPackage } from "@electron/asar";

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
      else if (entry.isFile() && predicate(entry.name, path)) matches.push(path);
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
  const names = ["app-update.yml", "app-update.yaml", "dev-app-update.yml", "dev-app-update.yaml"];
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
  const { stdout } = await execFile(
    "/usr/bin/lipo",
    ["-archs", binaryPath],
    { encoding: "utf8", maxBuffer: 64 * 1024 },
  );
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

function remoteScriptSource(content) {
  return (
    /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//iu.test(content) ||
    /\bimportScripts\s*\(\s*["']https?:\/\//u.test(content) ||
    /\bimport\s*\(\s*["']https?:\/\//u.test(content)
  );
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
      failure("unreadable_info_plist", "Info.plist could not be read with plutil."),
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
      failure("unreadable_asar", "The packaged application ASAR could not be listed."),
    );
  }

  const updater = updaterEntries(entries);
  try {
    updaterConfigurations = await ports.findUpdaterConfigurations(resourcesPath);
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
      const content = (await ports.readAsarEntry(asarPath, entry)).toString("utf8");
      if (remoteScriptSource(content)) {
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
      const nativeArchitectures = await ports.readArchitectures(nativeBinaries[0]);
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
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
    ...injectedPorts,
  };

  if (args.length !== 1 || !args[0].endsWith(".app")) {
    ports.stderr(
      JSON.stringify({
        ok: false,
        app: null,
        checks: null,
        failures: [
          failure(
            "invalid_arguments",
            "Usage: verify-package.mjs <path-to-application.app>",
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
        failures: [failure("verification_failed", "Package verification failed.")],
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
