#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import sharp from "sharp";

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(repositoryRoot, "build", "icon.svg");
const outputPath = join(repositoryRoot, "build", "icon.icns");
const iconFiles = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

const temporaryRoot = await mkdtemp(join(tmpdir(), "kopper-icons-"));
const iconsetPath = join(temporaryRoot, "icon.iconset");

try {
  await mkdir(iconsetPath);
  await Promise.all(
    iconFiles.map(async ([name, size]) => {
      await sharp(sourcePath, { density: 144 })
        .resize(size, size, { fit: "fill" })
        .png({ adaptiveFiltering: false, compressionLevel: 9 })
        .toFile(join(iconsetPath, name));
    }),
  );
  await rm(outputPath, { force: true });
  await execFile("/usr/bin/iconutil", [
    "-c",
    "icns",
    "-o",
    outputPath,
    iconsetPath,
  ]);
  console.log("Generated build/icon.icns from build/icon.svg.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
