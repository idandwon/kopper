import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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

function job(workflow: string, name: string) {
  const marker = `  ${name}:\n`;
  const start = workflow.indexOf(marker);
  expect(start, `missing workflow job: ${name}`).toBeGreaterThanOrEqual(0);
  const next = workflow.slice(start + marker.length).search(/^  [a-z][a-z0-9_]*:\n/mu);
  return workflow.slice(
    start,
    next === -1 ? workflow.length : start + marker.length + next,
  );
}

function releaseAssetArguments(workflow: string) {
  const create = step(workflow, "Create draft GitHub Release");
  const marker = 'gh release create "$GITHUB_REF_NAME"';
  const commandStart = create.indexOf(marker);
  expect(
    commandStart,
    "missing gh release create command",
  ).toBeGreaterThanOrEqual(0);
  const argumentsStart = commandStart + marker.length;
  const flagsStart = create.indexOf("--verify-tag", argumentsStart);
  expect(flagsStart, "missing gh release create flags").toBeGreaterThan(
    argumentsStart,
  );
  const positionalArguments = create.slice(argumentsStart, flagsStart);
  return (
    positionalArguments.match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^\s\\]+/gu) ?? []
  );
}

function expectExactReleaseAssetArguments(workflow: string) {
  expect(releaseAssetArguments(workflow)).toEqual([
    '"$DMG_PATH"',
    '"$CHECKSUM_PATH"',
    '"$INSTALLER_PATH"',
  ]);
}

function embeddedNodeScript(workflow: string, stepName: string, marker: string) {
  const source = step(workflow, stepName);
  const match = source.match(
    new RegExp(`<<'${marker}'\\n([\\s\\S]*?)^          ${marker}$`, "mu"),
  );
  expect(match, `missing embedded Node script: ${marker}`).not.toBeNull();
  return match![1].replace(/^ {10}/gmu, "");
}

const candidateDirectories: string[] = [];
const acceptedCommit = "a".repeat(40);
const movedCommit = "b".repeat(40);

interface CandidateFixtureOptions {
  assetNames?: string[];
  assetDmg?: string;
  assetInstaller?: string;
  checkedOutCommit?: string;
  downloadedAssetMutation?:
    | "extra-file"
    | "installer-directory"
    | "installer-symlink"
    | "missing-installer";
  expectedCommit?: string;
  expectedDmgSha256?: string;
  expectedReleaseDraft?: "true" | "false";
  packageVersion?: string;
  releaseDraft?: boolean;
  releaseImmutable?: boolean;
  remoteTagCommit?: string;
  requireImmutable?: "true" | "false";
  tagCommit?: string;
  taggedInstaller?: string;
}

function runCandidateValidator(options: CandidateFixtureOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), "kopper-candidate-test-"));
  candidateDirectories.push(directory);
  const assetDirectory = join(directory, "assets");
  mkdirSync(assetDirectory);

  const tag = "v0.1.0";
  const artifact = "Kopper-0.1.0-universal.dmg";
  const checksum = `${artifact}.sha256`;
  const installer = "install.sh";
  const dmg = options.assetDmg ?? "accepted dmg bytes";
  const dmgSha256 = createHash("sha256").update(dmg).digest("hex");
  writeFileSync(join(assetDirectory, artifact), dmg);
  writeFileSync(join(assetDirectory, checksum), `${dmgSha256}  ${artifact}\n`);
  writeFileSync(
    join(assetDirectory, installer),
    options.assetInstaller ?? "#!/bin/bash\nexit 0\n",
  );

  switch (options.downloadedAssetMutation) {
    case "extra-file":
      writeFileSync(join(assetDirectory, "release-notes.txt"), "unexpected\n");
      break;
    case "installer-directory":
      rmSync(join(assetDirectory, installer));
      mkdirSync(join(assetDirectory, installer));
      break;
    case "installer-symlink":
      rmSync(join(assetDirectory, installer));
      symlinkSync(artifact, join(assetDirectory, installer));
      break;
    case "missing-installer":
      rmSync(join(assetDirectory, installer));
      break;
  }

  const releaseJson = join(directory, "release.json");
  writeFileSync(
    releaseJson,
    JSON.stringify({
      tagName: tag,
      isDraft: options.releaseDraft ?? true,
      isImmutable: options.releaseImmutable ?? false,
      assets: (options.assetNames ?? [artifact, checksum, installer]).map(
        (name) => ({ name }),
      ),
    }),
  );
  const taggedInstaller = join(directory, "tagged-install.sh");
  writeFileSync(
    taggedInstaller,
    options.taggedInstaller ?? "#!/bin/bash\nexit 0\n",
  );
  const validator = join(directory, "validate-release-candidate.cjs");
  writeFileSync(
    validator,
    embeddedNodeScript(
      promote,
      "Prepare trusted candidate validator",
      "VALIDATE_CANDIDATE",
    ),
  );

  return spawnSync(
    process.execPath,
    [validator, releaseJson, assetDirectory, taggedInstaller],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CHECKED_OUT_COMMIT: options.checkedOutCommit ?? acceptedCommit,
        EXPECTED_COMMIT: options.expectedCommit ?? acceptedCommit,
        EXPECTED_DMG_SHA256: options.expectedDmgSha256 ?? dmgSha256,
        EXPECTED_RELEASE_DRAFT: options.expectedReleaseDraft ?? "true",
        INPUT_TAG: tag,
        PACKAGE_VERSION: options.packageVersion ?? "0.1.0",
        REMOTE_TAG_COMMIT: options.remoteTagCommit ?? acceptedCommit,
        REQUIRE_IMMUTABLE: options.requireImmutable ?? "false",
        TAG_COMMIT: options.tagCommit ?? acceptedCommit,
      },
    },
  );
}

afterEach(() => {
  for (const directory of candidateDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const actionPins = new Map([
  ["actions/checkout", "11d5960a326750d5838078e36cf38b85af677262"],
  ["actions/setup-node", "49933ea5288caeca8642d1e84afbd3f7d6820020"],
  ["actions/upload-artifact", "ea165f8d65b6e75b540449e92b4886f43607fa02"],
  ["actions/download-artifact", "d3f86a106a0bac45b974a628896c90dbdf5c8093"],
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

  it("isolates candidate execution from the protected draft publisher", () => {
    const build = job(release, "build_candidate");
    const publish = job(release, "publish_draft");

    expect(build).toContain("permissions:\n      contents: read");
    expect(build).not.toContain("environment: release");
    expect(build).toContain("pnpm install --frozen-lockfile");
    expect(build).toContain("actions/upload-artifact@");

    expect(publish).toContain("permissions:\n      contents: write");
    expect(publish).toContain("environment: release");
    expect(publish).toContain("actions/download-artifact@");
    expect(publish).toContain('git show "$GITHUB_SHA:install.sh"');
    expect(publish).not.toMatch(/\b(?:corepack|pnpm|npm|yarn)\b/u);
    expect(publish).not.toMatch(/(?:^|\s)(?:\.\/)?scripts\//mu);
    expect(publish).not.toMatch(/(?:bash|sh)\s+[^\n]*install\.sh/u);
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

  it("stages and uploads exactly the three release assets", () => {
    const stage = step(release, "Stage exact release candidate");
    const upload = step(release, "Upload exact release candidate");

    expect(stage).toContain("Kopper-${version}-universal.dmg");
    expect(stage).toContain("expectedAssets");
    expect(stage).toContain("entry.isFile()");
    expect(upload).toContain("if-no-files-found: error");
    expect(upload).toContain("include-hidden-files: false");
  });

  it("creates a draft from only the three staged asset arguments", () => {
    const createRelease = step(release, "Create draft GitHub Release");
    expect(createRelease).toContain('gh release create "$GITHUB_REF_NAME"');
    expectExactReleaseAssetArguments(release);
    expect(createRelease).toContain("--draft");
    expect(createRelease).not.toContain("--draft=false");
  });

  it("rejects a fourth asset on the release-create command line", () => {
    const mutated = release.replace(
      'gh release create "$GITHUB_REF_NAME" \\',
      'gh release create "$GITHUB_REF_NAME" "release-notes.txt" \\',
    );

    expect(() => expectExactReleaseAssetArguments(mutated)).toThrow();
  });

  it("publishes the staged installer only after matching the event Git object", () => {
    const stage = step(release, "Stage exact release candidate");
    const inspect = step(release, "Validate staged release candidate");
    expect(stage).toContain("bash -n install.sh");
    expect(inspect).toContain('git show "$GITHUB_SHA:install.sh"');
    expect(inspect).toContain('cmp "$INSTALLER_PATH" "$tagged_installer"');
    const createRelease = step(release, "Create draft GitHub Release");
    expect(createRelease).toContain('"$INSTALLER_PATH"');
  });

  it("rechecks the remote tag at the event commit immediately before draft creation", () => {
    const recheck = step(release, "Recheck remote tag commit");
    const create = step(release, "Create draft GitHub Release");
    expect(recheck).toContain('test "$remote_tag_commit" = "$GITHUB_SHA"');
    expect(release.indexOf(recheck)).toBeLessThan(release.indexOf(create));
    expect(
      release.slice(
        release.indexOf(recheck) + recheck.length,
        release.indexOf(create),
      ).trim(),
    ).toBe("");
  });

  it("publishes only an exact inspected unsigned draft", () => {
    expect(promote).toContain("workflow_dispatch:");
    expect(promote).toContain("expected_commit:");
    expect(promote).toContain("expected_dmg_sha256:");
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
    expect(promote).not.toMatch(/\b(?:corepack|pnpm|npm|yarn)\b/u);
    expect(promote).not.toContain("actions/setup-node@");
    expect(promote).not.toMatch(/(?:^|\s)(?:\.\/)?scripts\//mu);
  });

  it("binds promotion to exact commit and DMG hash inputs", () => {
    const verify = step(promote, "Verify exact tag version and commit");
    const inspect = step(promote, "Inspect draft and verify exact candidate assets");

    expect(verify).toContain('^([0-9a-f]{40})$');
    expect(verify).toContain('^([0-9a-f]{64})$');
    expect(verify).toContain('test "$checked_out_commit" = "$EXPECTED_COMMIT"');
    expect(verify).toContain('test "$tag_commit" = "$EXPECTED_COMMIT"');
    expect(inspect).toContain(
      "CHECKED_OUT_COMMIT: ${{ steps.candidate.outputs.checked_out_commit }}",
    );
    expect(inspect).toContain(
      "TAG_COMMIT: ${{ steps.candidate.outputs.tag_commit }}",
    );
    expect(inspect).toContain("EXPECTED_DMG_SHA256:");
  });

  it("downloads and compares the installer with the expected commit Git object", () => {
    const inspect = step(promote, "Inspect draft and verify exact candidate assets");
    expect(inspect).toContain('--pattern "$INSTALLER"');
    expect(inspect).toContain('git show "$EXPECTED_COMMIT:install.sh"');
    expect(promote.indexOf(inspect)).toBeLessThan(
      promote.indexOf(step(promote, "Publish inspected unsigned draft")),
    );
  });

  it("executes the embedded candidate validator for an accepted draft", () => {
    const result = runCandidateValidator();

    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ["a non-draft release", { releaseDraft: false }, "draft state"],
    [
      "a missing asset",
      {
        assetNames: [
          "Kopper-0.1.0-universal.dmg",
          "Kopper-0.1.0-universal.dmg.sha256",
        ],
      },
      "exact asset set",
    ],
    [
      "an extra asset",
      {
        assetNames: [
          "Kopper-0.1.0-universal.dmg",
          "Kopper-0.1.0-universal.dmg.sha256",
          "install.sh",
          "release-notes.txt",
        ],
      },
      "exact asset set",
    ],
    [
      "an expected-commit mismatch",
      { expectedCommit: movedCommit },
      "expected commit",
    ],
    [
      "an expected-hash mismatch",
      { expectedDmgSha256: "b".repeat(64) },
      "expected DMG SHA-256",
    ],
    [
      "a replaced DMG even with its replacement checksum",
      {
        assetDmg: "replacement dmg bytes",
        expectedDmgSha256: createHash("sha256")
          .update("accepted dmg bytes")
          .digest("hex"),
      },
      "expected DMG SHA-256",
    ],
    [
      "a replaced installer",
      { assetInstaller: "#!/bin/bash\nexit 9\n" },
      "tagged installer",
    ],
    ["a moved remote tag", { remoteTagCommit: movedCommit }, "remote tag"],
  ] as const)("rejects %s", (_description, options, message) => {
    const result = runCandidateValidator(options);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it.each([
    ["a missing downloaded asset", "missing-installer"],
    ["an extra downloaded asset", "extra-file"],
    ["a downloaded directory asset", "installer-directory"],
    ["a downloaded symlink asset", "installer-symlink"],
  ] as const)(
    "rejects %s while the release metadata stays exact",
    (_description, downloadedAssetMutation) => {
      const result = runCandidateValidator({ downloadedAssetMutation });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "downloaded candidate does not contain the exact asset set",
      );
    },
  );

  it.each([
    ["expected commit", { expectedCommit: "A".repeat(40) }],
    ["expected DMG SHA-256", { expectedDmgSha256: "not-a-hash" }],
  ] as const)("rejects malformed %s input", (_description, options) => {
    const result = runCandidateValidator(options);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("format");
  });

  it("fails promotion unless the published release reports immutable", () => {
    const publish = step(promote, "Publish inspected unsigned draft");
    const verify = step(promote, "Redownload and verify immutable publication");

    expect(verify).toContain('gh release view "$INPUT_TAG" --json tagName,isDraft,isImmutable,assets');
    expect(verify).toContain('gh release download "$INPUT_TAG"');
    expect(verify).toContain('EXPECTED_RELEASE_DRAFT: "false"');
    expect(verify).toContain('REQUIRE_IMMUTABLE: "true"');
    expect(verify).toContain("EXPECTED_DMG_SHA256:");
    expect(promote.indexOf(publish)).toBeLessThan(promote.indexOf(verify));
  });

  it("accepts only a published immutable state during post-publication validation", () => {
    const accepted = runCandidateValidator({
      expectedReleaseDraft: "false",
      releaseDraft: false,
      releaseImmutable: true,
      requireImmutable: "true",
    });
    const mutable = runCandidateValidator({
      expectedReleaseDraft: "false",
      releaseDraft: false,
      releaseImmutable: false,
      requireImmutable: "true",
    });

    expect(accepted.status, accepted.stderr).toBe(0);
    expect(mutable.status).toBe(1);
    expect(mutable.stderr).toContain("immutable");
  });

  it("rechecks the remote tag immediately before irreversible publication", () => {
    const recheck = step(promote, "Recheck remote tag commit");
    const publish = step(promote, "Publish inspected unsigned draft");

    expect(recheck).toContain('test "$remote_tag_commit" = "$EXPECTED_COMMIT"');
    expect(promote.indexOf(recheck)).toBeLessThan(promote.indexOf(publish));
    expect(
      promote.slice(
        promote.indexOf(recheck) + recheck.length,
        promote.indexOf(publish),
      ).trim(),
    ).toBe("");
  });

  it("runs nonfinal release-document validation in CI", () => {
    const validation = step(ci, "Validate release documentation traceability");
    expect(validation).toContain("run: pnpm validate:release-docs");
    expect(validation).not.toContain("--final");
    expect(ci.indexOf(step(ci, "Validate public installer syntax"))).toBeLessThan(
      ci.indexOf(step(ci, "Run tests")),
    );
  });

});

describe("historical signed release-document validator coverage", () => {

  it("passes nonfinal trace validation and rejects incomplete historical final evidence", () => {
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

  it("rejects non-draft and mismatched historical final metadata", () => {
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
  ])("rejects historical final evidence whose asset list %s", (_description, assets) => {
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
