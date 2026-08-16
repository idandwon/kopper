import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { atomicReplace } from "./atomicFile";

const temporaryDirectories: string[] = [];

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "kopper-atomic-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("atomicReplace", () => {
  it("replaces the destination and removes the temporary file", async () => {
    const directory = await makeTemporaryDirectory();
    const path = join(directory, "kopper.json");

    await atomicReplace(path, "next");

    expect(await readFile(path, "utf8")).toBe("next");
    expect(await readdir(directory)).toEqual(["kopper.json"]);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("safely replaces a stale temporary symlink with a private file", async () => {
    const directory = await makeTemporaryDirectory();
    const path = join(directory, "kopper.json");
    const temporaryPath = `${path}.tmp-${process.pid}`;
    const staleTarget = join(directory, "stale-target");
    await writeFile(staleTarget, "sentinel");
    await chmod(staleTarget, 0o666);
    await symlink(staleTarget, temporaryPath);

    await atomicReplace(path, "next");

    expect(await readFile(staleTarget, "utf8")).toBe("sentinel");
    expect(await readFile(path, "utf8")).toBe("next");
    expect((await lstat(path)).isFile()).toBe(true);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await readdir(directory)).sort()).toEqual([
      "kopper.json",
      "stale-target",
    ]);
  });

  it("leaves the current document untouched when rename fails", async () => {
    const directory = await makeTemporaryDirectory();
    const path = join(directory, "kopper.json");
    await writeFile(path, "current");
    const failingRenameFs = {
      rename: async (): Promise<void> => {
        throw new Error("rename failed");
      },
    };

    await expect(atomicReplace(path, "next", failingRenameFs)).rejects.toThrow(
      "rename failed",
    );

    expect(await readFile(path, "utf8")).toBe("current");
    expect(await readdir(directory)).toEqual(["kopper.json"]);
  });
});
