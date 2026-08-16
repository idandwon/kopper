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

async function defaultRun(command, args) {
  const { stdout = "" } = await execFile(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return { stdout };
}

export async function runRelease(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const run = options.run ?? defaultRun;
  const log = options.log ?? ((line) => console.log(line));

  if (platform !== "darwin") {
    throw new Error("Credentialed releases must run on macOS.");
  }

  const status = await run("git", ["status", "--porcelain"]);
  if (status.stdout.trim().length > 0) {
    throw new Error("Credentialed releases require a clean Git worktree.");
  }

  const expectedTag = `v${version}`;
  let tag = "";
  try {
    tag = (
      await run("git", ["describe", "--tags", "--exact-match", "HEAD"])
    ).stdout.trim();
  } catch {
    throw new Error(`Credentialed releases require exact tag ${expectedTag}.`);
  }
  if (tag !== expectedTag) {
    throw new Error(`Credentialed releases require exact tag ${expectedTag}.`);
  }

  const missingCredentials = credentialNames.filter(
    (name) => typeof env[name] !== "string" || env[name].trim().length === 0,
  );
  if (missingCredentials.length > 0) {
    throw new Error(
      `Missing required release environment variables: ${missingCredentials.join(
        ", ",
      )}.`,
    );
  }

  const commands = [
    ["pnpm", ["test"], "Running tests."],
    ["pnpm", ["build"], "Building application assets."],
    [
      "pnpm",
      ["exec", "electron-builder", "--mac", "dmg", "--universal"],
      "Building the signed, notarized universal DMG.",
    ],
    [
      "pnpm",
      ["verify:package", appPath],
      "Verifying package metadata, content, and architectures.",
    ],
    [
      "/usr/bin/codesign",
      ["--verify", "--deep", "--strict", appPath],
      "Verifying the application signature.",
    ],
    [
      "/usr/sbin/spctl",
      ["--assess", "--type", "execute", appPath],
      "Assessing the application with Gatekeeper.",
    ],
    [
      "/usr/bin/xcrun",
      ["stapler", "validate", dmgPath],
      "Validating the stapled notarization ticket.",
    ],
  ];

  for (const [command, args, message] of commands) {
    log(message);
    await run(command, args);
  }
  log("Credentialed release verification completed.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await runRelease();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Credentialed release failed.",
    );
    process.exitCode = 1;
  }
}
