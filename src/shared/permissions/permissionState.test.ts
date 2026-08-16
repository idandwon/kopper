import { describe, expect, it } from "vitest";

import { mapAccessibilityTrust } from "./permissionState";

describe("mapAccessibilityTrust", () => {
  it("restricts Accessibility integration outside macOS", () => {
    expect(
      mapAccessibilityTrust({
        platform: "linux",
        trusted: true,
        prompted: true,
      }),
    ).toBe("restricted");
  });

  it("maps trusted macOS clients to granted", () => {
    expect(
      mapAccessibilityTrust({
        platform: "darwin",
        trusted: true,
        prompted: false,
      }),
    ).toBe("granted");
  });

  it("distinguishes an unrequested state from a denied request", () => {
    expect(
      mapAccessibilityTrust({
        platform: "darwin",
        trusted: false,
        prompted: false,
      }),
    ).toBe("unknown");
    expect(
      mapAccessibilityTrust({
        platform: "darwin",
        trusted: false,
        prompted: true,
      }),
    ).toBe("denied");
  });
});
