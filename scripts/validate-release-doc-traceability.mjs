#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const procedurePath = resolve(root, "tests/manual/macos-capture.md");
const templatePath = resolve(root, "docs/releases/acceptance-template.md");
const rowIdPattern = /^[A-Z]+-\d{2}$/;
const EXPECTED_CANONICAL_COUNT = 76;
const errors = [];

function parseArguments(args) {
  if (args.length === 0) return { final: false };
  const values = new Map();
  let final = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--final") {
      if (final) errors.push("--final may be specified only once.");
      final = true;
      continue;
    }
    if (!argument.startsWith("--") || index + 1 >= args.length) {
      errors.push(`Invalid argument ${JSON.stringify(argument)}.`);
      continue;
    }
    if (values.has(argument)) {
      errors.push(`${argument} may be specified only once.`);
    }
    values.set(argument, args[index + 1]);
    index += 1;
  }
  const allowed = new Set([
    "--version",
    "--tag",
    "--commit",
    "--artifact",
    "--checksum",
    "--artifact-sha256",
    "--release-json",
  ]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) errors.push(`Unknown argument ${key}.`);
  }
  if (!final) {
    errors.push("Release metadata arguments require --final.");
    return { final: false };
  }
  for (const key of allowed) {
    if (!values.has(key)) errors.push(`Final validation requires ${key}.`);
  }
  return {
    final: true,
    version: values.get("--version"),
    tag: values.get("--tag"),
    commit: values.get("--commit"),
    artifact: values.get("--artifact"),
    checksum: values.get("--checksum"),
    artifactSha256: values.get("--artifact-sha256"),
    releaseJson: values.get("--release-json"),
  };
}

function parseTables(markdown, relativePath) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (
      !lines[index].trim().startsWith("|") ||
      !/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[index + 1])
    ) {
      continue;
    }

    const parseRow = (line) =>
      line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim());
    const header = parseRow(lines[index]);
    const rows = [];
    index += 2;
    while (index < lines.length && lines[index].trim().startsWith("|")) {
      rows.push({ cells: parseRow(lines[index]), line: index + 1 });
      index += 1;
    }
    index -= 1;
    for (const row of rows) {
      if (row.cells.length !== header.length) {
        errors.push(
          `${relativePath}:${row.line}: Markdown table row has ${row.cells.length} cells; expected ${header.length}.`,
        );
      }
    }
    tables.push({ header, rows });
  }

  return tables;
}

function collectIdRows(tables) {
  return tables.flatMap((table) =>
    table.rows
      .filter(({ cells }) => rowIdPattern.test(cells[0] ?? ""))
      .map(({ cells, line }) => ({
        id: cells[0],
        meaning: cells[1],
        cells,
        line,
        header: table.header,
      })),
  );
}

function formatSequence(rows) {
  return rows.map(({ id, meaning }) => `${id}\t${meaning}`).join("\n");
}

function exactCellContains(cell, expected) {
  return cell
    .replaceAll("`", "")
    .split(/\s+/)
    .some((token) => token.replace(/[;,]$/u, "") === expected);
}

function metadataCell(tables, names) {
  for (const table of tables) {
    for (const row of table.rows) {
      if (names.includes(row.cells[0])) return row.cells.at(-1) ?? "";
    }
  }
  return undefined;
}

function requireMetadata(tables, names, expected, label, relativePath) {
  const cell = metadataCell(tables, names);
  if (cell === undefined || !exactCellContains(cell, expected)) {
    errors.push(
      `${relativePath}: ${label} must identify exact value ${JSON.stringify(expected)}.`,
    );
  }
}

const options = parseArguments(process.argv.slice(2));
const recordPaths = [templatePath];
if (options.final && options.version) {
  recordPaths.push(resolve(root, `docs/releases/v${options.version}-acceptance.md`));
} else {
  recordPaths.push(resolve(root, "docs/releases/v0.1.0-acceptance.md"));
}

const procedure = await readFile(procedurePath, "utf8");
const canonicalRows = collectIdRows(
  parseTables(procedure, "tests/manual/macos-capture.md"),
);
const canonicalIds = new Set(canonicalRows.map(({ id }) => id));

if (
  canonicalRows.length !== EXPECTED_CANONICAL_COUNT ||
  canonicalIds.size !== EXPECTED_CANONICAL_COUNT
) {
  errors.push(
    `Canonical procedure must contain exactly ${EXPECTED_CANONICAL_COUNT} duplicate-free ID rows; found ${canonicalRows.length} rows and ${canonicalIds.size} unique IDs.`,
  );
}

let versionedTables;
let versionedRelativePath;
for (const recordPath of recordPaths) {
  let record;
  try {
    record = await readFile(recordPath, "utf8");
  } catch {
    errors.push(`${recordPath.slice(root.length + 1)}: acceptance record is missing.`);
    continue;
  }
  const relativePath = recordPath.slice(root.length + 1);
  const tables = parseTables(record, relativePath);
  const allRecordRows = collectIdRows(tables);
  const recordRows = allRecordRows.filter(({ id }) => canonicalIds.has(id));

  if (formatSequence(recordRows) !== formatSequence(canonicalRows)) {
    errors.push(
      `${relativePath}: canonical ID/meaning sequence differs from tests/manual/macos-capture.md.\n` +
        `Expected:\n${formatSequence(canonicalRows)}\nActual:\n${formatSequence(recordRows)}`,
    );
  }

  const counts = new Map();
  for (const row of recordRows) {
    counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  }
  for (const { id } of canonicalRows) {
    if (counts.get(id) !== 1) {
      errors.push(`${relativePath}: ${id} must appear exactly once.`);
    }
  }

  for (const row of recordRows) {
    const statusIndex = row.header.indexOf("Status");
    const evidenceIndex = row.header.lastIndexOf("Evidence/blocker");
    if (
      statusIndex < 0 ||
      evidenceIndex < 0 ||
      evidenceIndex !== row.header.length - 1
    ) {
      errors.push(
        `${relativePath}:${row.line}: ${row.id} needs its own exact Status cell and final Evidence/blocker cell.`,
      );
      continue;
    }
    if (!["Pass", "Fail", "Not run"].includes(row.cells[statusIndex])) {
      errors.push(
        `${relativePath}:${row.line}: ${row.id} has invalid status ${JSON.stringify(row.cells[statusIndex])}.`,
      );
    }
    if (!row.cells[evidenceIndex]) {
      errors.push(
        `${relativePath}:${row.line}: ${row.id} has an empty Evidence/blocker cell.`,
      );
    }
  }

  if (options.final && recordPath !== templatePath) {
    versionedTables = tables;
    versionedRelativePath = relativePath;
  }
}

if (options.final && versionedTables && versionedRelativePath) {
  for (const table of versionedTables) {
    const statusIndex = table.header.indexOf("Status");
    if (statusIndex < 0) continue;
    for (const row of table.rows) {
      const status = row.cells[statusIndex];
      if (status === "Fail" || status === "Not run") {
        errors.push(
          `${versionedRelativePath}:${row.line}: final evidence cannot contain required status ${status}.`,
        );
      }
    }
  }

  if (!/^\d+\.\d+\.\d+$/u.test(options.version ?? "")) {
    errors.push("Final version must be an exact numeric semantic version.");
  }
  if (options.tag !== `v${options.version}`) {
    errors.push("Final tag must equal v<version> exactly.");
  }
  if (!/^[0-9a-f]{40}$/u.test(options.commit ?? "")) {
    errors.push("Final commit must be a full lowercase 40-character SHA.");
  }
  const expectedArtifact = `Kopper-${options.version}-universal.dmg`;
  if (options.artifact !== expectedArtifact) {
    errors.push(`Final artifact must be named ${expectedArtifact}.`);
  }
  if (options.checksum !== `${expectedArtifact}.sha256`) {
    errors.push(`Final checksum must be named ${expectedArtifact}.sha256.`);
  }
  if (!/^[0-9a-f]{64}$/u.test(options.artifactSha256 ?? "")) {
    errors.push("Final artifact SHA-256 must be 64 lowercase hexadecimal characters.");
  }

  requireMetadata(
    versionedTables,
    ["Package version", "Package version in tested source"],
    options.version,
    "package version",
    versionedRelativePath,
  );
  requireMetadata(
    versionedTables,
    ["Release tag", "Exact release tag"],
    options.tag,
    "release tag",
    versionedRelativePath,
  );
  requireMetadata(
    versionedTables,
    ["Full release commit SHA", "Exact automated-gate source SHA"],
    options.commit,
    "release commit",
    versionedRelativePath,
  );
  requireMetadata(
    versionedTables,
    ["DMG filename", "Protected DMG filename"],
    options.artifact,
    "DMG filename",
    versionedRelativePath,
  );
  requireMetadata(
    versionedTables,
    ["Published checksum filename"],
    options.checksum,
    "checksum filename",
    versionedRelativePath,
  );
  requireMetadata(
    versionedTables,
    ["Published DMG SHA-256", "Published/downloaded protected DMG SHA-256"],
    options.artifactSha256,
    "artifact SHA-256",
    versionedRelativePath,
  );

  try {
    const release = JSON.parse(await readFile(options.releaseJson, "utf8"));
    if (release.isDraft !== true) {
      errors.push("GitHub Release must still be a draft before promotion.");
    }
    if (release.tagName !== options.tag) {
      errors.push("GitHub Release tag does not match the exact promotion tag.");
    }
    const assetNames = Array.isArray(release.assets)
      ? release.assets.map((asset) => asset?.name).sort()
      : [];
    const expectedNames = [options.artifact, options.checksum].sort();
    if (JSON.stringify(assetNames) !== JSON.stringify(expectedNames)) {
      errors.push("GitHub Release assets do not exactly match the DMG and checksum evidence.");
    }
  } catch {
    errors.push("GitHub Release draft metadata could not be read.");
  }
}

if (errors.length > 0) {
  console.error(
    `Release documentation traceability validation failed (${errors.length} error(s)):\n`,
  );
  console.error(errors.join("\n\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Release documentation traceability valid: ${EXPECTED_CANONICAL_COUNT} canonical rows match in 2 acceptance records${options.final ? "; final evidence matches the draft candidate" : ""}.`,
  );
}
