import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

type InstallerCall = { command: string; args: string[]; marker: string };

type InstallerFailure =
  | "checksum"
  | "checksum-name"
  | "cleanup"
  | "dmg-download"
  | "dmg-gatekeeper"
  | "installed-codesign"
  | "launch"
  | "mounted-codesign"
  | "replacement-move"
  | "signal"
  | "staged-gatekeeper";

type InstallerFixtureOptions = {
  curlFails?: boolean;
  existingApp?: string;
  failure?: InstallerFailure;
  latestUrl?: string;
  macosVersion?: string;
  missingCommand?: string;
  mountedApps?: string[];
  platform?: string;
  running?: boolean;
  userId?: string;
};

const fixtureDirectories: string[] = [];

afterEach(() => {
  for (const directory of fixtureDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function expectCallSubsequence(actual: string[], expected: string[]) {
  let previousIndex = -1;
  for (const marker of expected) {
    const index = actual.indexOf(marker, previousIndex + 1);
    expect(index, `expected ${marker} after call index ${previousIndex}`).toBeGreaterThan(
      previousIndex,
    );
    previousIndex = index;
  }
}

function createInstallerFixture(options: InstallerFixtureOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), "kopper-installer-test-"));
  fixtureDirectories.push(directory);

  const bin = join(directory, "bin");
  const home = join(directory, "home");
  const applications = join(home, "Applications");
  const target = join(applications, "Kopper.app");
  const temporaryDirectory = join(directory, "installer-temporary-directory");
  const configurationPath = join(directory, "configuration.json");
  const logPath = join(directory, "calls.jsonl");
  const sentinel = join(home, "sibling-sentinel.txt");
  mkdirSync(bin);
  mkdirSync(home);
  writeFileSync(sentinel, "preserve-me");
  if (options.existingApp) {
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "marker.txt"), options.existingApp);
  }
  writeFileSync(
    configurationPath,
    JSON.stringify({
      curlFails: options.curlFails ?? false,
      failure: options.failure ?? null,
      latestUrl:
        options.latestUrl ??
        "https://github.com/idandwon/kopper/releases/tag/v0.1.0",
      macosVersion: options.macosVersion ?? "14.0.0",
      mountedApps: options.mountedApps ?? ["Kopper.app"],
      platform: options.platform ?? "Darwin",
      running: options.running ?? false,
      temporaryDirectory,
      userId: options.userId ?? "501",
    }),
  );

  const shim = `#!${process.execPath}
const { appendFileSync, cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require("node:fs");
const { basename, dirname, join } = require("node:path");

const configuration = JSON.parse(readFileSync(process.env.KOPPER_FIXTURE_CONFIGURATION, "utf8"));
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
const last = args.at(-1) || "";
let marker = command;
if (command === "spctl") {
  marker = args.includes("open") ? "spctl-dmg"
    : last.includes("/mount/") ? "spctl-mounted"
    : last.includes(".install.") ? "spctl-staged" : "spctl-installed";
} else if (command === "codesign") {
  marker = last.includes("/mount/") ? "codesign-mounted"
    : last.includes(".install.") ? "codesign-staged" : "codesign-installed";
} else if (command === "hdiutil") {
  marker = args[0] === "attach" ? "hdiutil-attach" : "hdiutil-detach";
}
appendFileSync(
  process.env.KOPPER_FIXTURE_LOG,
  JSON.stringify({ command, args, marker }) + "\\n",
);

if (command === "uname") {
  process.stdout.write(configuration.platform + "\\n");
} else if (command === "sw_vers") {
  process.stdout.write(configuration.macosVersion + "\\n");
} else if (command === "id") {
  process.stdout.write(configuration.userId + "\\n");
} else if (command === "curl") {
  if (configuration.curlFails) process.exit(1);
  const outputIndex = args.indexOf("-o");
  if (args.includes("-w")) {
    process.stdout.write(configuration.latestUrl);
  } else {
    const output = args[outputIndex + 1];
    if (configuration.failure === "dmg-download" && output.endsWith(".dmg")) process.exit(1);
    mkdirSync(dirname(output), { recursive: true });
    if (output.endsWith(".sha256")) {
      const dmgName = basename(output, ".sha256");
      const checksumName = configuration.failure === "checksum-name" ? "Other.dmg" : dmgName;
      writeFileSync(output, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  " + checksumName + "\\n");
    } else {
      writeFileSync(output, "dmg");
    }
  }
} else if (command === "mktemp") {
  mkdirSync(configuration.temporaryDirectory, { recursive: true });
  process.stdout.write(configuration.temporaryDirectory + "\\n");
} else if (command === "shasum") {
  if (configuration.failure === "checksum") process.exit(1);
} else if (command === "spctl") {
  if (configuration.failure === "dmg-gatekeeper" && marker === "spctl-dmg") process.exit(1);
  if (configuration.failure === "staged-gatekeeper" && marker === "spctl-staged") process.exit(1);
} else if (command === "hdiutil") {
  if (args[0] === "attach") {
    const mountPoint = args[args.indexOf("-mountpoint") + 1];
    mkdirSync(mountPoint, { recursive: true });
    for (const appName of configuration.mountedApps) {
      const app = join(mountPoint, appName);
      mkdirSync(app, { recursive: true });
      writeFileSync(join(app, "marker.txt"), "new-v0.1.0");
    }
  } else {
    if (configuration.failure === "cleanup") {
      configuration.failure = null;
      writeFileSync(process.env.KOPPER_FIXTURE_CONFIGURATION, JSON.stringify(configuration));
      process.exit(1);
    }
    rmSync(last, { recursive: true, force: true });
  }
} else if (command === "codesign") {
  if (configuration.failure === "mounted-codesign" && marker === "codesign-mounted") process.exit(1);
  if (configuration.failure === "installed-codesign" && marker === "codesign-installed") process.exit(1);
  if (configuration.failure === "signal" && marker === "codesign-staged") {
    process.kill(process.ppid, "SIGTERM");
    process.exit(1);
  }
} else if (command === "ditto") {
  cpSync(args[0], args[1], { recursive: true });
} else if (command === "pgrep") {
  process.exit(configuration.running ? 0 : 1);
} else if (command === "open") {
  if (configuration.failure === "launch") process.exit(1);
} else if (command === "mv") {
  if (configuration.failure === "replacement-move" && args[0].includes(".install.")) process.exit(1);
  renameSync(args[0], args[1]);
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
  if (options.failure === "replacement-move") {
    const shimPath = join(bin, "mv");
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
    callsInOrder: () => calls().map(({ marker }) => marker),
    downloadCalls: () =>
      calls().filter(
        ({ command, args }) =>
          command === "curl" && args.includes("-o") && !args.includes("-w"),
      ),
    hasMountedImage: () => existsSync(join(temporaryDirectory, "mount")),
    installedMarker: () =>
      existsSync(join(target, "marker.txt"))
        ? readFileSync(join(target, "marker.txt"), "utf8")
        : undefined,
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
    sentinel: () => readFileSync(sentinel, "utf8"),
    temporaryArtifacts: () => {
      const artifacts = [temporaryDirectory].filter(existsSync);
      if (existsSync(applications)) {
        artifacts.push(
          ...readdirSync(applications)
            .filter((name) => name.startsWith(".Kopper.app."))
            .map((name) => join(applications, name)),
        );
      }
      return artifacts;
    },
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
});

describe("verified transactional installation", () => {
  it("downloads exact versioned assets, verifies, installs, cleans up, and launches", () => {
    const fixture = createInstallerFixture();
    const result = fixture.run();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Kopper installed successfully.");
    expect(fixture.installedMarker()).toBe("new-v0.1.0");
    expect(fixture.hasMountedImage()).toBe(false);
    expect(fixture.temporaryArtifacts()).toEqual([]);
    expect(fixture.sentinel()).toBe("preserve-me");
    expect(fixture.downloadCalls().map(({ args }) => args.at(-1))).toEqual([
      "https://github.com/idandwon/kopper/releases/download/v0.1.0/Kopper-0.1.0-universal.dmg",
      "https://github.com/idandwon/kopper/releases/download/v0.1.0/Kopper-0.1.0-universal.dmg.sha256",
    ]);
    for (const { args } of fixture.downloadCalls()) {
      expect(args).toEqual(
        expect.arrayContaining([
          "-fL",
          "--retry",
          "3",
          "--proto",
          "=https",
          "--tlsv1.2",
        ]),
      );
    }
    expectCallSubsequence(fixture.callsInOrder(), [
      "shasum",
      "spctl-dmg",
      "hdiutil-attach",
      "codesign-mounted",
      "spctl-mounted",
      "ditto",
      "codesign-staged",
      "spctl-staged",
      "codesign-installed",
      "spctl-installed",
      "hdiutil-detach",
      "open",
    ]);
  });

  it("mounts the downloaded image read-only without browsing it", () => {
    const fixture = createInstallerFixture();
    expect(fixture.run().status).toBe(0);

    const attach = fixture.calls().find(({ marker }) => marker === "hdiutil-attach");
    expect(attach?.args).toEqual(
      expect.arrayContaining(["attach", "-readonly", "-nobrowse", "-mountpoint"]),
    );
  });

  it("leaves the existing application untouched when verification fails", () => {
    for (const failure of [
      "checksum",
      "dmg-gatekeeper",
      "mounted-codesign",
      "staged-gatekeeper",
    ] as const) {
      const fixture = createInstallerFixture({ failure, existingApp: "old" });
      expect(fixture.run().status, failure).toBe(1);
      expect(fixture.installedMarker(), failure).toBe("old");
      expect(fixture.temporaryArtifacts(), failure).toEqual([]);
    }
  }, 30_000);

  it("restores the previous application when replacement or final operations fail", () => {
    for (const failure of [
      "replacement-move",
      "installed-codesign",
      "cleanup",
      "launch",
    ] as const) {
      const fixture = createInstallerFixture({ failure, existingApp: "old" });
      expect(fixture.run().status, failure).toBe(1);
      expect(fixture.installedMarker(), failure).toBe("old");
      expect(fixture.temporaryArtifacts(), failure).toEqual([]);
    }
  }, 30_000);

  it("refuses to replace a running Kopper process", () => {
    const fixture = createInstallerFixture({ running: true, existingApp: "old" });
    const result = fixture.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Quit Kopper, then run this command again.");
    expect(fixture.installedMarker()).toBe("old");
    expect(fixture.temporaryArtifacts()).toEqual([]);
  });

  it("reports an artifact download failure and removes temporary files", () => {
    const fixture = createInstallerFixture({ failure: "dmg-download" });
    const result = fixture.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Could not download Kopper-0.1.0-universal.dmg.");
    expect(fixture.temporaryArtifacts()).toEqual([]);
  });

  it("rejects a checksum naming mismatch before checksum verification", () => {
    const fixture = createInstallerFixture({
      existingApp: "old",
      failure: "checksum-name",
    });
    const result = fixture.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("The Kopper checksum file is invalid.");
    expect(fixture.callsInOrder()).not.toContain("shasum");
    expect(fixture.installedMarker()).toBe("old");
    expect(fixture.temporaryArtifacts()).toEqual([]);
  });

  it.each([
    { mountedApps: [], description: "zero" },
    { mountedApps: ["Kopper.app", "Other.app"], description: "multiple" },
    { mountedApps: ["Other.app"], description: "wrongly named" },
  ])("rejects $description root-level application bundles", ({ mountedApps }) => {
    const fixture = createInstallerFixture({ existingApp: "old", mountedApps });
    const result = fixture.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("disk image does not contain exactly one Kopper.app");
    expect(fixture.installedMarker()).toBe("old");
    expect(fixture.temporaryArtifacts()).toEqual([]);
  });

  it("installs successfully when no previous target exists", () => {
    const fixture = createInstallerFixture();

    expect(fixture.run().status).toBe(0);
    expect(fixture.installedMarker()).toBe("new-v0.1.0");
    expect(fixture.temporaryArtifacts()).toEqual([]);
  });

  it("cleans up after a termination signal without disturbing the existing app", () => {
    const fixture = createInstallerFixture({ failure: "signal", existingApp: "old" });
    const result = fixture.run();

    expect(result.status).toBe(1);
    expect(fixture.installedMarker()).toBe("old");
    expect(fixture.hasMountedImage()).toBe(false);
    expect(fixture.temporaryArtifacts()).toEqual([]);
    expect(fixture.sentinel()).toBe("preserve-me");
  });
});
