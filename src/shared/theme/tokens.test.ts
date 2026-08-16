import { describe, expect, it } from "vitest";

import { KOPPER_THEME_TOKENS, SHADCN_THEME_TOKENS } from "./tokens";

describe("theme tokens", () => {
  it("defines the exact canonical shadcn token order", () => {
    expect(SHADCN_THEME_TOKENS).toEqual([
      "background",
      "foreground",
      "card",
      "card-foreground",
      "popover",
      "popover-foreground",
      "primary",
      "primary-foreground",
      "secondary",
      "secondary-foreground",
      "muted",
      "muted-foreground",
      "accent",
      "accent-foreground",
      "destructive",
      "destructive-foreground",
      "border",
      "input",
      "ring",
      "radius",
    ]);
  });

  it("defines the exact canonical Kopper lifecycle token order", () => {
    expect(KOPPER_THEME_TOKENS).toEqual([
      "capture",
      "organized",
      "completed",
    ]);
  });
});
