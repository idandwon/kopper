import {
  open as openFile,
  rename as renameFile,
  unlink as unlinkFile,
} from "node:fs/promises";
import { dirname } from "node:path";

interface AtomicFileSystem {
  open: typeof openFile;
  rename: typeof renameFile;
  unlink: typeof unlinkFile;
}

export type AtomicFileSystemOverrides = Partial<AtomicFileSystem>;

export type AtomicReplaceStage = "before_rename" | "after_rename";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown filesystem error.";
}

export class AtomicReplaceError extends Error {
  readonly name = "AtomicReplaceError";

  constructor(
    readonly stage: AtomicReplaceStage,
    readonly cause: unknown,
  ) {
    super(describeError(cause));
  }
}

const nodeFileSystem: AtomicFileSystem = {
  open: openFile,
  rename: renameFile,
  unlink: unlinkFile,
};

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function removeTemporaryFile(
  temporaryPath: string,
  fileSystem: AtomicFileSystem,
): Promise<void> {
  try {
    await fileSystem.unlink(temporaryPath);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function createTemporaryFile(
  temporaryPath: string,
  fileSystem: AtomicFileSystem,
) {
  try {
    return await fileSystem.open(temporaryPath, "wx", 0o600);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "EEXIST") {
      throw error;
    }
  }

  await removeTemporaryFile(temporaryPath, fileSystem);
  return fileSystem.open(temporaryPath, "wx", 0o600);
}

export async function atomicReplace(
  path: string,
  contents: string,
  overrides: AtomicFileSystemOverrides = {},
): Promise<void> {
  const fileSystem: AtomicFileSystem = { ...nodeFileSystem, ...overrides };
  const temporaryPath = `${path}.tmp-${process.pid}`;
  let renameCommitted = false;

  try {
    const temporaryFile = await createTemporaryFile(temporaryPath, fileSystem);
    try {
      await temporaryFile.chmod(0o600);
      await temporaryFile.writeFile(contents, "utf8");
      await temporaryFile.sync();
    } finally {
      await temporaryFile.close();
    }

    await fileSystem.rename(temporaryPath, path);
    renameCommitted = true;

    const parentDirectory = await fileSystem.open(dirname(path), "r");
    try {
      await parentDirectory.sync();
    } finally {
      await parentDirectory.close();
    }
  } catch (error) {
    try {
      await removeTemporaryFile(temporaryPath, fileSystem);
    } catch (cleanupError) {
      throw new AtomicReplaceError(
        renameCommitted ? "after_rename" : "before_rename",
        cleanupError,
      );
    }

    throw new AtomicReplaceError(
      renameCommitted ? "after_rename" : "before_rename",
      error,
    );
  }
}
