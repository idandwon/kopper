import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

type InstallerCall = { command: string; args: string[] };

type InstallerFixtureOptions = {
  curlFails?: boolean;
  latestUrl?: string;
  macosVersion?: string;
  missingCommand?: string;
  platform?: string;
  userId?: string;
};

const fixtureDirectories: string[] = [];

afterEach(() => {
  for (const directory of fixtureDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createInstallerFixture(options: InstallerFixtureOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), "kopper-installer-test-"));
  fixtureDirectories.push(directory);

  const bin = join(directory, "bin");
  const home = join(directory, "home");
  const temporaryDirectory = join(directory, "installer-temporary-directory");
  const configurationPath = join(directory, "configuration.json");
  const logPath = join(directory, "calls.jsonl");
  mkdirSync(bin);
  mkdirSync(home);
  writeFileSync(
    configurationPath,
    JSON.stringify({
      curlFails: options.curlFails ?? false,
      latestUrl:
        options.latestUrl ??
        "https://github.com/idandwon/kopper/releases/tag/v0.1.0",
      macosVersion: options.macosVersion ?? "14.0.0",
      platform: options.platform ?? "Darwin",
      temporaryDirectory,
      userId: options.userId ?? "501",
    }),
  );

  const shim = `#!${process.execPath}
const { appendFileSync, mkdirSync, readFileSync } = require("node:fs");
const { basename } = require("node:path");

const configuration = JSON.parse(readFileSync(process.env.KOPPER_FIXTURE_CONFIGURATION, "utf8"));
const command = basename(process.argv[1]);
appendFileSync(
  process.env.KOPPER_FIXTURE_LOG,
  JSON.stringify({ command, args: process.argv.slice(2) }) + "\\n",
);

if (command === "uname") {
  process.stdout.write(configuration.platform + "\\n");
} else if (command === "sw_vers") {
  process.stdout.write(configuration.macosVersion + "\\n");
} else if (command === "id") {
  process.stdout.write(configuration.userId + "\\n");
} else if (command === "curl") {
  if (configuration.curlFails) process.exit(1);
  process.stdout.write(configuration.latestUrl);
} else if (command === "mktemp") {
  mkdirSync(configuration.temporaryDirectory, { recursive: true });
  process.stdout.write(configuration.temporaryDirectory + "\\n");
}
`;

  for (const command of [
    "uname",
    "sw_vers",
    "id",
    "curl",
    "hdiutil",
    "shasum",
    "codesign",
    "spctl",
    "ditto",
    "open",
    "pgrep",
    "mktemp",
  ]) {
    if (command === options.missingCommand) continue;
    const shimPath = join(bin, command);
    writeFileSync(shimPath, shim);
    chmodSync(shimPath, 0o755);
  }

  const calls = (): InstallerCall[] => {
    try {
      return readFileSync(logPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as InstallerCall);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  };

  return {
    calls,
    downloadUrls: () =>
      calls()
        .filter(({ command }) => command === "curl")
        .map(({ args }) => args.at(-1) ?? "")
        .filter((url) => url.includes("/releases/download/")),
    run: () =>
      spawnSync("bash", [join(process.cwd(), "install.sh")], {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          KOPPER_FIXTURE_CONFIGURATION: configurationPath,
          KOPPER_FIXTURE_LOG: logPath,
          PATH: `${bin}:/bin`,
          TMPDIR: join(directory, "tmp"),
        },
      }),
  };
}

describe("public macOS installer preflight", () => {
  it("rejects non-macOS without contacting GitHub", () => {
    const fixture = createInstallerFixture({ platform: "Linux" });
    const result = fixture.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Kopper requires macOS 14 or newer.");
    expect(fixture.calls()).not.toContainEqual(
      expect.objectContaining({ command: "curl" }),
    );
  });

  it("rejects macOS 13 and root execution", () => {
    expect(createInstallerFixture({ macosVersion: "13.6.9" }).run().stderr).toContain(
      "Kopper requires macOS 14 or newer.",
    );
    expect(createInstallerFixture({ userId: "0" }).run().stderr).toContain(
      "Do not run the Kopper installer as root or with sudo.",
    );
  });

  it("rejects a missing required macOS command before release resolution", () => {
    const fixture = createInstallerFixture({ missingCommand: "hdiutil" });
    const result = fixture.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Required macOS command not found: hdiutil.",
    );
    expect(fixture.calls()).not.toContainEqual(
      expect.objectContaining({ command: "curl" }),
    );
  });

  it("rejects an unavailable latest release", () => {
    const result = createInstallerFixture({ curlFails: true }).run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Could not find a published Kopper release.");
  });

  it("rejects an invalid release URL", () => {
    const result = createInstallerFixture({
      latestUrl: "https://github.com/idandwon/kopper/releases/v0.1.0",
    }).run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GitHub returned an invalid Kopper release URL.");
  });

  it("rejects a malformed release tag", () => {
    const result = createInstallerFixture({
      latestUrl: "https://github.com/idandwon/kopper/releases/tag/latest",
    }).run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GitHub returned an invalid Kopper release tag.");
  });

  it("resolves an exact public semantic-version tag without downloading artifacts", () => {
    const fixture = createInstallerFixture({
      latestUrl: "https://github.com/idandwon/kopper/releases/tag/v0.1.0",
    });
    const result = fixture.run();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Finding latest Kopper release...");
    expect(fixture.calls()).toContainEqual(
      expect.objectContaining({ command: "mktemp" }),
    );
    expect(fixture.downloadUrls()).toEqual([]);
  });
});
