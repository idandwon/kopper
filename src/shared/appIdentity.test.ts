import { describe, expect, it } from "vitest";
import { APP_BUNDLE_ID, APP_NAME, STORE_FILE_NAME } from "./appIdentity";

describe("app identity", () => {
  it("uses stable user-visible and persistence names", () => {
    expect(APP_NAME).toBe("Kopper");
    expect(APP_BUNDLE_ID).toBe("com.kopper.app");
    expect(STORE_FILE_NAME).toBe("kopper.json");
  });
});
