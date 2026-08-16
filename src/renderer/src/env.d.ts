import type { KopperApi } from "../../shared/ipc/contract";

declare global {
  interface Window {
    kopper: KopperApi;
  }
}
