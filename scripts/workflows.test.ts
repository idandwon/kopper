import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const release = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
const promote = readFileSync(
  new URL("../.github/workflows/promote-release.yml", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };

function step(workflow: string, name: string) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  expect(start, `missing workflow step: ${name}`).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("\n      - name: ", start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

const actionPins = new Map([
  ["actions/checkout", "11d5960a326750d5838078e36cf38b85af677262"],
  ["actions/setup-node", "49933ea5288caeca8642d1e84afbd3f7d6820020"],
  ["actions/upload-artifact", "ea165f8d65b6e75b540449e92b4886f43607fa02"],
]);

describe("workflow security semantics", () => {
  it("pins every official action to the verified immutable v4 commit", () => {
    for (const workflow of [ci, release, promote]) {
      const uses = [
        ...workflow.matchAll(/^\s+uses: (actions\/[^@\s]+)@([^\s]+)$/gmu),
      ];
      expect(uses.length).toBeGreaterThan(0);
      for (const [, action, revision] of uses) {
        const expectedRevision = actionPins.get(action);
        expect(revision, action).toBe(expectedRevision);
        expect(workflow, action).toContain(
          `# ${action} v4 => ${expectedRevision}`,
        );
      }
    }
  });

  it.each([
    [
      "Upload failure Playwright traces",
      "steps.e2e.outcome == 'failure'",
      "hashFiles('test-results/**/trace.zip') != ''",
    ],
    [
      "Upload failed unsigned application",
      "steps.package_unsigned.outcome == 'failure'",
      "hashFiles('release/mac-universal/Kopper.app/**') != ''",
    ],
  ])(
    "keeps %s conditional on the relevant failure and existing files, and non-blocking",
    (name, relevantFailure, filesExist) => {
      const upload = step(ci, name);
      expect(upload).toContain("failure()");
      expect(upload).toContain(relevantFailure);
      expect(upload).toContain(filesExist);
      expect(upload).toContain("continue-on-error: true");
      expect(upload).toContain("if-no-files-found: ignore");
    },
  );

  it("builds the release without Apple credentials, signing, or notarization", () => {
    expect(release).not.toMatch(/secrets\.|APPLE_|CSC_|notarytool|stapler/u);
    const build = step(release, "Build unsigned universal DMG");
    expect(build).toContain("run: pnpm package:beta");
    expect(packageJson.scripts["package:beta"]).toContain("--mac dmg --universal");
    expect(packageJson.scripts["package:beta"]).toContain("-c.mac.identity=null");
    expect(packageJson.scripts["package:beta"]).toContain("-c.mac.notarize=false");
  });

  it("validates tag/version equality before release gates", () => {
    const version = step(release, "Verify exact tag version");
    expect(version).toContain('test "$GITHUB_REF_NAME" = "v${package_version}"');
    expect(release.indexOf(version)).toBeLessThan(
      release.indexOf(step(release, "Run tests")),
    );
  });

  it("runs every unsigned release gate before packaging", () => {
    const names = [
      "Run tests",
      "Run typecheck",
      "Build application",
      "Run Electron end-to-end tests",
      "Audit production dependencies",
      "Audit application source",
    ];
    const packageStep = step(release, "Build unsigned universal DMG");
    for (const name of names) {
      expect(release.indexOf(step(release, name))).toBeLessThan(
        release.indexOf(packageStep),
      );
    }
  });

  it("verifies unsigned package metadata before draft creation", () => {
    const verify = step(release, "Verify unsigned package");
    expect(verify).toContain(
      'pnpm verify:package "release/mac-universal/Kopper.app"',
    );
    expect(release.indexOf(verify)).toBeLessThan(
      release.indexOf(step(release, "Create draft GitHub Release")),
    );
  });

  it("creates only a draft candidate from a pushed exact tag", () => {
    const createRelease = step(release, "Create draft GitHub Release");
    expect(createRelease).toContain('gh release create "$GITHUB_REF_NAME"');
    expect(createRelease.match(/"\$DMG_PATH"/gu)).toHaveLength(1);
    expect(createRelease.match(/"\$CHECKSUM_PATH"/gu)).toHaveLength(1);
    expect(createRelease.match(/"\$INSTALLER_PATH"/gu)).toHaveLength(1);
    expect(createRelease).toContain("--draft");
    expect(createRelease).not.toContain("--draft=false");
  });

  it("publishes the syntax-checked installer from the exact tagged checkout", () => {
    const checksum = step(release, "Generate exact release assets");
    expect(checksum).toContain("bash -n install.sh");
    expect(checksum).toContain("installer_path=install.sh");
    const createRelease = step(release, "Create draft GitHub Release");
    expect(createRelease).toContain(
      "INSTALLER_PATH: ${{ steps.assets.outputs.installer_path }}",
    );
    expect(createRelease).toContain('"$INSTALLER_PATH"');
  });

  it("publishes only an exact inspected unsigned draft", () => {
    expect(promote).toContain("workflow_dispatch:");
    expect(promote).toContain("environment: release");
    expect(promote).toContain("permissions:\n  contents: write");
    const checkout = step(promote, "Check out exact release tag");
    const inspect = step(promote, "Inspect draft and verify exact candidate assets");
    const publish = step(promote, "Publish inspected unsigned draft");
    expect(checkout).toContain("ref: ${{ inputs.tag }}");
    expect(checkout).toContain("persist-credentials: false");
    expect(promote).not.toContain("--final");
    expect(promote).not.toContain("Validate final release evidence");
    expect(promote.indexOf(inspect)).toBeLessThan(promote.indexOf(publish));
    expect(publish).toContain('gh release edit "$TAG" --draft=false');
    expect(publish).toContain("GH_TOKEN: ${{ github.token }}");
    expect(inspect).toContain("release.isDraft !== true");
    expect(inspect).toContain(
      "JSON.stringify(assetNames) !== JSON.stringify(expectedAssets)",
    );
  });

  it("downloads and compares the installer before promotion", () => {
    const inspect = step(promote, "Inspect draft and verify exact candidate assets");
    expect(inspect).toContain('--pattern "$INSTALLER"');
    expect(inspect).toContain('cmp "$INSTALLER" "$GITHUB_WORKSPACE/install.sh"');
    expect(promote.indexOf(inspect)).toBeLessThan(
      promote.indexOf(step(promote, "Publish inspected unsigned draft")),
    );
  });

  it("fails promotion unless the published release reports immutable", () => {
    const publish = step(promote, "Publish inspected unsigned draft");
    const verify = step(promote, "Verify published release is immutable");

    expect(verify).toContain(
      'gh release view "$TAG" --json tagName,isDraft,isImmutable',
    );
    expect(verify).toContain('test "$published_tag" = "$TAG"');
    expect(verify).toContain('test "$published_draft" = "false"');
    expect(verify).toContain('test "$published_immutable" = "true"');
    expect(promote.indexOf(publish)).toBeLessThan(promote.indexOf(verify));
  });

  it("runs nonfinal release-document validation in CI", () => {
    const validation = step(ci, "Validate release documentation traceability");
    expect(validation).toContain("run: pnpm validate:release-docs");
    expect(validation).not.toContain("--final");
    expect(ci.indexOf(step(ci, "Validate public installer syntax"))).toBeLessThan(
      ci.indexOf(step(ci, "Run tests")),
    );
  });

  it("passes nonfinal trace validation and rejects the current incomplete v0.1.0 draft for final promotion", () => {
    expect(() =>
      execFileSync("node", ["scripts/validate-release-doc-traceability.mjs"], {
        cwd: new URL("..", import.meta.url),
        stdio: "pipe",
      }),
    ).not.toThrow();

    const directory = mkdtempSync(join(tmpdir(), "kopper-release-json-"));
    const releaseJson = join(directory, "release.json");
    writeFileSync(
      releaseJson,
      JSON.stringify({
        isDraft: true,
        tagName: "v0.1.0",
        assets: [
          { name: "Kopper-0.1.0-universal.dmg" },
          { name: "Kopper-0.1.0-universal.dmg.sha256" },
          { name: "install.sh" },
        ],
      }),
    );
    try {
      const result = spawnSync(
        "node",
        [
          "scripts/validate-release-doc-traceability.mjs",
          "--final",
          "--version",
          "0.1.0",
          "--tag",
          "v0.1.0",
          "--commit",
          "b98857d81d77421d4261536f71ce55321f2c7ac1",
          "--artifact",
          "Kopper-0.1.0-universal.dmg",
          "--checksum",
          "Kopper-0.1.0-universal.dmg.sha256",
          "--artifact-sha256",
          "a".repeat(64),
          "--release-json",
          releaseJson,
        ],
        { cwd: new URL("..", import.meta.url), encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("final evidence cannot contain required status Not run");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects non-draft and mismatched final candidate metadata", () => {
    const directory = mkdtempSync(join(tmpdir(), "kopper-release-json-"));
    const releaseJson = join(directory, "release.json");
    writeFileSync(
      releaseJson,
      JSON.stringify({ isDraft: false, tagName: "v9.9.9", assets: [] }),
    );
    try {
      const result = spawnSync(
        "node",
        [
          "scripts/validate-release-doc-traceability.mjs",
          "--final",
          "--version",
          "0.1.0",
          "--tag",
          "v9.9.9",
          "--commit",
          "not-a-commit",
          "--artifact",
          "wrong.dmg",
          "--checksum",
          "wrong.sha256",
          "--artifact-sha256",
          "not-a-checksum",
          "--release-json",
          releaseJson,
        ],
        { cwd: new URL("..", import.meta.url), encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Final tag must equal v<version> exactly.");
      expect(result.stderr).toContain("Final commit must be a full lowercase 40-character SHA.");
      expect(result.stderr).toContain("Final artifact must be named Kopper-0.1.0-universal.dmg.");
      expect(result.stderr).toContain("Final checksum must be named Kopper-0.1.0-universal.dmg.sha256.");
      expect(result.stderr).toContain("Final artifact SHA-256 must be 64 lowercase hexadecimal characters.");
      expect(result.stderr).toContain("GitHub Release must still be a draft before promotion.");
      expect(result.stderr).toContain("GitHub Release assets do not exactly match the DMG, checksum, and installer evidence.");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "is missing the installer",
      [
        { name: "Kopper-0.1.0-universal.dmg" },
        { name: "Kopper-0.1.0-universal.dmg.sha256" },
      ],
    ],
    [
      "contains an unexpected fourth asset",
      [
        { name: "Kopper-0.1.0-universal.dmg" },
        { name: "Kopper-0.1.0-universal.dmg.sha256" },
        { name: "install.sh" },
        { name: "release-notes.txt" },
      ],
    ],
  ])("rejects a final release whose asset list %s", (_description, assets) => {
    const directory = mkdtempSync(join(tmpdir(), "kopper-release-json-"));
    const releaseJson = join(directory, "release.json");
    writeFileSync(
      releaseJson,
      JSON.stringify({ isDraft: true, tagName: "v0.1.0", assets }),
    );
    try {
      const result = spawnSync(
        "node",
        [
          "scripts/validate-release-doc-traceability.mjs",
          "--final",
          "--version",
          "0.1.0",
          "--tag",
          "v0.1.0",
          "--commit",
          "b98857d81d77421d4261536f71ce55321f2c7ac1",
          "--artifact",
          "Kopper-0.1.0-universal.dmg",
          "--checksum",
          "Kopper-0.1.0-universal.dmg.sha256",
          "--artifact-sha256",
          "a".repeat(64),
          "--release-json",
          releaseJson,
        ],
        { cwd: new URL("..", import.meta.url), encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "GitHub Release assets do not exactly match the DMG, checksum, and installer evidence.",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
