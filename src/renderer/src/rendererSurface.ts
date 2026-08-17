export type RendererSurface = "capture-hud" | "content";

export function rendererSurface(hash: string): RendererSurface {
  return hash === "#capture-hud" ? "capture-hud" : "content";
}
