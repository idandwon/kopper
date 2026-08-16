import { describe, expect, it, vi } from "vitest";

import type { CaptureOutcome } from "../../shared/ipc/contract";
import type { PermissionState } from "../../shared/permissions/permissionState";
import { CaptureRequestService } from "./captureRequestService.js";

const captured: CaptureOutcome = {
  status: "captured",
  noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
};

function setup() {
  let available = false;
  const observe = vi.fn<() => Promise<PermissionState>>(async () => "granted");
  const coordinator = { requestCapture: vi.fn(async () => captured) };
  const publish = vi.fn();
  const service = new CaptureRequestService(
    { observe },
    { isCaptureAvailable: () => available },
    coordinator,
    publish,
  );
  return {
    service,
    observe,
    coordinator,
    publish,
    setAvailable(value: boolean) {
      available = value;
    },
  };
}

describe("CaptureRequestService", () => {
  it("rechecks permission immediately before a capture and coordinates only after a reconciled grant", async () => {
    const fixture = setup();
    fixture.setAvailable(true);

    await expect(fixture.service.requestCapture()).resolves.toEqual(captured);

    expect(fixture.observe).toHaveBeenCalledExactlyOnceWith(false);
    expect(fixture.coordinator.requestCapture).toHaveBeenCalledOnce();
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it("prevents capture after a pre-capture revoke and publishes the unavailable outcome", async () => {
    const fixture = setup();
    fixture.setAvailable(true);
    fixture.observe.mockImplementationOnce(async () => {
      fixture.setAvailable(false);
      return "denied";
    });

    const result = await fixture.service.requestCapture();

    expect(result).toMatchObject({
      status: "failed",
      error: { code: "permission_denied", recoveryAction: "open_settings" },
    });
    expect(fixture.coordinator.requestCapture).not.toHaveBeenCalled();
    expect(fixture.publish).toHaveBeenCalledExactlyOnceWith(result);
  });

  it("prevents capture when observation fails or the granted binding remains unavailable", async () => {
    const fixture = setup();
    fixture.observe.mockRejectedValueOnce(new Error("private trust error"));

    const failedCheck = await fixture.service.requestCapture();
    expect(failedCheck).toMatchObject({ status: "failed" });
    expect(JSON.stringify(failedCheck)).not.toContain("private trust error");

    fixture.observe.mockResolvedValueOnce("granted");
    const unavailableBinding = await fixture.service.requestCapture();
    expect(unavailableBinding).toMatchObject({ status: "failed" });
    expect(fixture.coordinator.requestCapture).not.toHaveBeenCalled();
    expect(fixture.publish).toHaveBeenCalledTimes(2);
  });
});
