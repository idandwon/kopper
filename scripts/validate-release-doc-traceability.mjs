#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const procedurePath = resolve(root, "tests/manual/macos-capture.md");
const recordPaths = [
  resolve(root, "docs/releases/acceptance-template.md"),
  resolve(root, "docs/releases/v0.1.0-acceptance.md"),
];
const rowIdPattern = /^[A-Z]+-\d{2}$/;
const errors = [];

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

const procedure = await readFile(procedurePath, "utf8");
const canonicalRows = collectIdRows(
  parseTables(procedure, "tests/manual/macos-capture.md"),
);
const canonicalIds = new Set(canonicalRows.map(({ id }) => id));

if (canonicalRows.length === 0 || canonicalIds.size !== canonicalRows.length) {
  errors.push(
    "Canonical procedure must contain a non-empty, duplicate-free ID sequence.",
  );
}

for (const recordPath of recordPaths) {
  const record = await readFile(recordPath, "utf8");
  const relativePath = recordPath.slice(root.length + 1);
  const allRecordRows = collectIdRows(parseTables(record, relativePath));
  const recordRows = allRecordRows.filter(({ id }) => canonicalIds.has(id));

  if (formatSequence(recordRows) !== formatSequence(canonicalRows)) {
    errors.push(
      `${relativePath}: canonical ID/meaning sequence differs from tests/manual/macos-capture.md.\n` +
        `Expected:\n${formatSequence(canonicalRows)}\nActual:\n${formatSequence(recordRows)}`,
    );
  }

  const counts = new Map();
  for (const row of recordRows)
    counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  for (const { id } of canonicalRows) {
    if (counts.get(id) !== 1)
      errors.push(`${relativePath}: ${id} must appear exactly once.`);
  }

  for (const row of recordRows) {
    const statusIndex = row.header.findIndex((cell) => cell === "Status");
    const evidenceIndex = row.header.findIndex((cell) =>
      /Evidence|blocker/i.test(cell),
    );
    if (statusIndex < 0 || evidenceIndex < 0) {
      errors.push(
        `${relativePath}:${row.line}: ${row.id} needs its own Status and Evidence/blocker cells.`,
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
}

if (errors.length > 0) {
  console.error(
    `Release documentation traceability validation failed (${errors.length} error(s)):\n`,
  );
  console.error(errors.join("\n\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Release documentation traceability valid: ${canonicalRows.length} canonical rows match in 2 acceptance records.`,
  );
}
