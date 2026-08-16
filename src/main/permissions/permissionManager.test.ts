import { describe, expect, it, vi } from "vitest";

import {
  PermissionManager,
  type PermissionManagerAdapters,
} from "./permissionManager";

function adapters(
  overrides: Partial<PermissionManagerAdapters> = {},
): PermissionManagerAdapters {
  return {
    platform: "darwin",
    isTrustedAccessibilityClient: vi.fn(() => false),
    openAccessibilitySettings: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("PermissionManager", () => {
  it("never calls the macOS trust API on another platform", () => {
    const dependencies = adapters({ platform: "linux" });
    const manager = new PermissionManager(dependencies);

    expect(manager.check(false)).toBe("restricted");
    expect(manager.check(true)).toBe("restricted");
    expect(dependencies.isTrustedAccessibilityClient).not.toHaveBeenCalled();
  });

  it("never prompts on a passive check and remembers a prompt for the session", () => {
    const dependencies = adapters();
    const manager = new PermissionManager(dependencies);

    expect(manager.check(false)).toBe("unknown");
    expect(manager.check(true)).toBe("denied");
    expect(manager.check(false)).toBe("denied");
    expect(dependencies.isTrustedAccessibilityClient).toHaveBeenNthCalledWith(
      1,
      false,
    );
    expect(dependencies.isTrustedAccessibilityClient).toHaveBeenNthCalledWith(
      2,
      true,
    );
    expect(dependencies.isTrustedAccessibilityClient).toHaveBeenNthCalledWith(
      3,
      false,
    );
  });

  it("reports trust immediately when granted", () => {
    const manager = new PermissionManager(
      adapters({ isTrustedAccessibilityClient: vi.fn(() => true) }),
    );

    expect(manager.check(false)).toBe("granted");
  });

  it("delegates only to the fixed Accessibility settings adapter", async () => {
    const dependencies = adapters();
    const manager = new PermissionManager(dependencies);

    await expect(manager.openSettings()).resolves.toBeUndefined();
    expect(
      dependencies.openAccessibilitySettings,
    ).toHaveBeenCalledExactlyOnceWith();
  });
});
