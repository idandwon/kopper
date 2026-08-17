import { describe, expect, it } from "vitest";

import { rendererSurface } from "./rendererSurface";

describe("rendererSurface", () => {
  it("classifies only the exact capture HUD hash as the capture surface", () => {
    expect(rendererSurface("#capture-hud")).toBe("capture-hud");
    expect(rendererSurface("")).toBe("content");
    expect(rendererSurface("#editor=note-1")).toBe("content");
    expect(rendererSurface("#capture-hud/extra")).toBe("content");
  });
});
