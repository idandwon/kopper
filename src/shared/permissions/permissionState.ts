import { z } from "zod";

export const PermissionStateSchema = z.enum([
  "unknown",
  "granted",
  "denied",
  "restricted",
]);
export type PermissionState = z.infer<typeof PermissionStateSchema>;

export interface AccessibilityTrustInput {
  platform: string;
  trusted: boolean;
  prompted: boolean;
}

export function mapAccessibilityTrust({
  platform,
  trusted,
  prompted,
}: AccessibilityTrustInput): PermissionState {
  if (platform !== "darwin") return "restricted";
  if (trusted) return "granted";
  return prompted ? "denied" : "unknown";
}
