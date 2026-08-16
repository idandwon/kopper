import { describe, expect, it, vi } from "vitest";

import {
  registerNativeAppearance,
  type NativeAppearanceSource,
} from "./nativeAppearance";

function source(): NativeAppearanceSource & {
  on: ReturnType<typeof vi.fn<NativeAppearanceSource["on"]>>;
  off: ReturnType<typeof vi.fn<NativeAppearanceSource["off"]>>;
} {
  return {
    shouldUseDarkColors: false,
    on: vi.fn<NativeAppearanceSource["on"]>(),
    off: vi.fn<NativeAppearanceSource["off"]>(),
  };
}

describe("registerNativeAppearance", () => {
  it("registers exactly one updated listener that publishes the current boolean", () => {
    const nativeTheme = source();
    const publish = vi.fn();

    registerNativeAppearance(nativeTheme, publish);

    expect(nativeTheme.on).toHaveBeenCalledTimes(1);
    expect(nativeTheme.on).toHaveBeenCalledWith("updated", expect.any(Function));
    const updated = nativeTheme.on.mock.calls[0]?.[1];
    if (updated === undefined) throw new Error("updated listener was not registered");

    nativeTheme.shouldUseDarkColors = true;
    updated();
    nativeTheme.shouldUseDarkColors = false;
    updated();
    expect(publish.mock.calls).toEqual([[true], [false]]);
  });

  it("cleanup removes that exact listener once", () => {
    const nativeTheme = source();
    const cleanup = registerNativeAppearance(nativeTheme, vi.fn());
    const updated = nativeTheme.on.mock.calls[0]?.[1];

    cleanup();
    cleanup();

    expect(nativeTheme.off).toHaveBeenCalledTimes(1);
    expect(nativeTheme.off).toHaveBeenCalledWith("updated", updated);
  });
});
