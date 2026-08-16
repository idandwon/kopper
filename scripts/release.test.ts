import { describe, expect, it, vi } from "vitest";

import { runRelease } from "./release.mjs";

const secrets = {
  APPLE_API_KEY: "/private/temporary/AuthKey.p8",
  APPLE_API_KEY_ID: "private-key-id",
  APPLE_API_ISSUER: "private-issuer",
};

function createRunner(overrides: Record<string, string> = {}) {
  const calls: Array<{ command: string; args: string[] }> = [];
  const outputs: Record<string, string> = {
    "git status --porcelain": "",
    "git describe --tags --exact-match HEAD": "v0.1.0\n",
    ...overrides,
  };
  const run = vi.fn(async (command: string, args: string[]) => {
    calls.push({ command, args });
    return { stdout: outputs[[command, ...args].join(" ")] ?? "" };
  });
  return { calls, run };
}

describe("credentialed release preflight", () => {
  it("rejects non-darwin hosts before running commands", async () => {
    const runner = createRunner();

    await expect(
      runRelease({ platform: "linux", env: secrets, run: runner.run }),
    ).rejects.toThrow("macOS");
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("rejects a dirty worktree, an inexact tag, and missing secret names", async () => {
    const dirty = createRunner({ "git status --porcelain": " M package.json\n" });
    await expect(
      runRelease({ platform: "darwin", env: secrets, run: dirty.run }),
    ).rejects.toThrow("clean Git worktree");

    const tag = createRunner({
      "git describe --tags --exact-match HEAD": "v0.1.1\n",
    });
    await expect(
      runRelease({ platform: "darwin", env: secrets, run: tag.run }),
    ).rejects.toThrow("v0.1.0");

    const missing = createRunner();
    await expect(
      runRelease({
        platform: "darwin",
        env: { ...secrets, APPLE_API_KEY_ID: "" },
        run: missing.run,
      }),
    ).rejects.toThrow("APPLE_API_KEY_ID");
  });

  it("runs the complete credentialed release gate without logging credential values", async () => {
    const runner = createRunner();
    const logs: string[] = [];

    await runRelease({
      platform: "darwin",
      env: secrets,
      run: runner.run,
      log: (line: string) => logs.push(line),
    });

    expect(runner.calls).toEqual([
      { command: "git", args: ["status", "--porcelain"] },
      {
        command: "git",
        args: ["describe", "--tags", "--exact-match", "HEAD"],
      },
      { command: "pnpm", args: ["test"] },
      { command: "pnpm", args: ["build"] },
      {
        command: "pnpm",
        args: ["exec", "electron-builder", "--mac", "dmg", "--universal"],
      },
      {
        command: "pnpm",
        args: ["verify:package", "release/mac-universal/Kopper.app"],
      },
      {
        command: "/usr/bin/codesign",
        args: [
          "--verify",
          "--deep",
          "--strict",
          "release/mac-universal/Kopper.app",
        ],
      },
      {
        command: "/usr/sbin/spctl",
        args: [
          "--assess",
          "--type",
          "execute",
          "release/mac-universal/Kopper.app",
        ],
      },
      {
        command: "/usr/bin/xcrun",
        args: [
          "stapler",
          "validate",
          "release/Kopper-0.1.0-universal.dmg",
        ],
      },
    ]);
    const output = logs.join("\n");
    for (const secret of Object.values(secrets)) expect(output).not.toContain(secret);
  });
});
