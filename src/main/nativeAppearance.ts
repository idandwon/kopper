export interface NativeAppearanceSource {
  shouldUseDarkColors: boolean;
  on(event: "updated", listener: () => void): unknown;
  off(event: "updated", listener: () => void): unknown;
}

export function registerNativeAppearance(
  source: NativeAppearanceSource,
  publish: (shouldUseDarkColors: boolean) => void,
): () => void {
  const updated = () => {
    publish(source.shouldUseDarkColors);
  };
  source.on("updated", updated);

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    source.off("updated", updated);
  };
}
