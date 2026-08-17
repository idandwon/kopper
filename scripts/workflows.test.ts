import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const release = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

function step(workflow: string, name: string) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  expect(start, `missing workflow step: ${name}`).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("\n      - name: ", start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

function secretNames(value: string) {
  return [...value.matchAll(/secrets\.([A-Z0-9_]+)/gu)].map((match) => match[1]);
}

const actionPins = new Map([
  ["actions/checkout", "11d5960a326750d5838078e36cf38b85af677262"],
  ["actions/setup-node", "49933ea5288caeca8642d1e84afbd3f7d6820020"],
  ["actions/upload-artifact", "ea165f8d65b6e75b540449e92b4886f43607fa02"],
]);

describe("workflow security semantics", () => {
  it("pins every official action to the verified immutable v4 commit", () => {
    for (const workflow of [ci, release]) {
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

  it("does not expose signing or release credentials to dependency installation", () => {
    const jobPreamble = release.slice(0, release.indexOf("    steps:\n"));
    const install = step(release, "Install dependencies from lockfile");

    expect(jobPreamble).not.toContain("secrets.");
    expect(install).not.toContain("secrets.");
    expect(install).not.toMatch(/APPLE_API|CSC_|GH_TOKEN/u);
  });

  it("scopes each release credential to only the step that consumes it", () => {
    const checkout = step(release, "Check out tagged revision");
    const prepareKey = step(release, "Prepare Apple API key");
    const packageRelease = step(release, "Build signed and notarized release");
    const createRelease = step(release, "Create GitHub Release");
    const cleanup = step(release, "Remove temporary Apple API key");

    expect(checkout).toContain("persist-credentials: false");
    expect(new Set(secretNames(prepareKey))).toEqual(
      new Set(["APPLE_API_KEY_P8", "APPLE_API_KEY_ID"]),
    );
    expect(new Set(secretNames(packageRelease))).toEqual(
      new Set([
        "APPLE_API_KEY_ID",
        "APPLE_API_ISSUER",
        "CSC_LINK",
        "CSC_KEY_PASSWORD",
      ]),
    );
    expect(createRelease).toContain("GH_TOKEN: ${{ github.token }}");
    expect(createRelease).not.toContain("secrets.");
    expect(cleanup).not.toMatch(/secrets\.|APPLE_API_KEY_ID|APPLE_API_KEY_P8/u);
    expect(cleanup).toContain('$RUNNER_TEMP/kopper-release-secrets');
  });
});
