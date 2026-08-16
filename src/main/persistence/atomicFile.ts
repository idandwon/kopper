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

export async function atomicReplace(
  path: string,
  contents: string,
  overrides: AtomicFileSystemOverrides = {},
): Promise<void> {
  const fileSystem: AtomicFileSystem = { ...nodeFileSystem, ...overrides };
  const temporaryPath = `${path}.tmp-${process.pid}`;

  try {
    const temporaryFile = await fileSystem.open(temporaryPath, "w", 0o600);
    try {
      await temporaryFile.writeFile(contents, "utf8");
      await temporaryFile.sync();
    } finally {
      await temporaryFile.close();
    }

    await fileSystem.rename(temporaryPath, path);

    const parentDirectory = await fileSystem.open(dirname(path), "r");
    try {
      await parentDirectory.sync();
    } finally {
      await parentDirectory.close();
    }
  } catch (error) {
    await removeTemporaryFile(temporaryPath, fileSystem);
    throw error;
  }
}
