import {
  mapAccessibilityTrust,
  type PermissionState,
} from "../../shared/permissions/permissionState";

export const ACCESSIBILITY_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

export interface PermissionManagerAdapters {
  platform: string;
  isTrustedAccessibilityClient(prompt: boolean): boolean;
  openExternal(url: string): Promise<void>;
}

export class PermissionManager {
  private prompted = false;

  constructor(private readonly adapters: PermissionManagerAdapters) {}

  check(prompt: boolean): PermissionState {
    if (this.adapters.platform !== "darwin") {
      return "restricted";
    }

    const trusted = this.adapters.isTrustedAccessibilityClient(prompt);
    if (prompt) this.prompted = true;
    return mapAccessibilityTrust({
      platform: this.adapters.platform,
      trusted,
      prompted: this.prompted,
    });
  }

  async openSettings(): Promise<void> {
    await this.adapters.openExternal(ACCESSIBILITY_SETTINGS_URL);
  }
}
