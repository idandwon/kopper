#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const version = packageJson.version;
const appPath = "release/mac-universal/Kopper.app";
const dmgPath = `release/Kopper-${version}-universal.dmg`;
const credentialNames = [
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
];

class ReleaseError extends Error {}

async function defaultRun(command, args, env) {
  const { stdout = "" } = await execFile(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return { stdout };
}

async function runStep(run, command, args, failureMessage) {
  try {
    return await run(command, args);
  } catch {
    throw new ReleaseError(failureMessage);
  }
}

export async function runRelease(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const run = options.run ?? ((command, args) => defaultRun(command, args, env));
  const log = options.log ?? ((line) => console.log(line));

  if (platform !== "darwin") {
    throw new ReleaseError("Credentialed releases must run on macOS.");
  }

  const status = await runStep(
    run,
    "git",
    ["status", "--porcelain"],
    "Credentialed release failed while checking Git status.",
  );
  if (status.stdout.trim().length > 0) {
    throw new ReleaseError(
      "Credentialed releases require a clean Git worktree.",
    );
  }

  const expectedTag = `v${version}`;
  const tag = (
    await runStep(
      run,
      "git",
      ["describe", "--tags", "--exact-match", "HEAD"],
      `Credentialed releases require exact tag ${expectedTag}.`,
    )
  ).stdout.trim();
  if (tag !== expectedTag) {
    throw new ReleaseError(
      `Credentialed releases require exact tag ${expectedTag}.`,
    );
  }

  const missingCredentials = credentialNames.filter(
    (name) => typeof env[name] !== "string" || env[name].trim().length === 0,
  );
  if (missingCredentials.length > 0) {
    throw new ReleaseError(
      `Missing required release environment variables: ${missingCredentials.join(
        ", ",
      )}.`,
    );
  }

  const commands = [
    {
      command: "pnpm",
      args: ["test"],
      message: "Running tests.",
      failure: "Credentialed release failed during tests.",
    },
    {
      command: "pnpm",
      args: ["build"],
      message: "Building application assets.",
      failure: "Credentialed release failed during the application build.",
    },
    {
      command: "pnpm",
      args: ["exec", "electron-builder", "--mac", "dmg", "--universal"],
      message: "Building the signed universal DMG with built-in app notarization.",
      failure: "Credentialed release failed during universal DMG packaging.",
    },
    {
      command: "pnpm",
      args: ["verify:package", appPath],
      message: "Verifying package metadata, content, and architectures.",
      failure: "Credentialed release failed during package verification.",
    },
    {
      command: "/usr/bin/xcrun",
      args: ["stapler", "validate", appPath],
      message: "Validating the stapled application ticket.",
      failure: "Credentialed release failed during application ticket validation.",
    },
    {
      command: "/usr/bin/codesign",
      args: ["--verify", "--deep", "--strict", appPath],
      message: "Verifying the application signature.",
      failure: "Credentialed release failed during application signature verification.",
    },
    {
      command: "/usr/sbin/spctl",
      args: ["--assess", "--type", "execute", appPath],
      message: "Assessing the application with Gatekeeper.",
      failure: "Credentialed release failed during application Gatekeeper assessment.",
    },
    {
      command: "/usr/bin/xcrun",
      args: [
        "notarytool",
        "submit",
        dmgPath,
        "--key",
        env.APPLE_API_KEY,
        "--key-id",
        env.APPLE_API_KEY_ID,
        "--issuer",
        env.APPLE_API_ISSUER,
        "--wait",
      ],
      message: "Submitting the universal DMG for notarization.",
      failure: "Credentialed release failed during DMG notarization.",
    },
    {
      command: "/usr/bin/xcrun",
      args: ["stapler", "staple", dmgPath],
      message: "Stapling the notarized DMG.",
      failure: "Credentialed release failed during DMG stapling.",
    },
    {
      command: "/usr/bin/xcrun",
      args: ["stapler", "validate", dmgPath],
      message: "Validating the stapled DMG ticket.",
      failure: "Credentialed release failed during DMG ticket validation.",
    },
    {
      command: "/usr/sbin/spctl",
      args: [
        "--assess",
        "--type",
        "open",
        "--context",
        "context:primary-signature",
        dmgPath,
      ],
      message: "Assessing the DMG with Gatekeeper.",
      failure: "Credentialed release failed during DMG Gatekeeper assessment.",
    },
  ];

  for (const { command, args, message, failure } of commands) {
    log(message);
    await runStep(run, command, args, failure);
  }
  log("Credentialed release verification completed.");
}

export async function runCli(options = {}) {
  const stderr = options.stderr ?? ((line) => console.error(line));
  try {
    await runRelease(options);
    return 0;
  } catch (error) {
    stderr(
      error instanceof ReleaseError
        ? error.message
        : "Credentialed release failed.",
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = await runCli();
}
