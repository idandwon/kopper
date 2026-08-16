import { describe, expect, it } from "vitest";
import { APP_NAME, STORE_FILE_NAME } from "./appIdentity";

describe("app identity", () => {
  it("uses stable user-visible and persistence names", () => {
    expect(APP_NAME).toBe("Kopper");
    expect(STORE_FILE_NAME).toBe("kopper.json");
  });
});
