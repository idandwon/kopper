import type { CompleteThemeMode } from "../../../shared/theme/themeSchema";

const CANONICAL_THEME_PROPERTIES = [
  ["background", "--background"],
  ["foreground", "--foreground"],
  ["card", "--card"],
  ["card-foreground", "--card-foreground"],
  ["popover", "--popover"],
  ["popover-foreground", "--popover-foreground"],
  ["primary", "--primary"],
  ["primary-foreground", "--primary-foreground"],
  ["secondary", "--secondary"],
  ["secondary-foreground", "--secondary-foreground"],
  ["muted", "--muted"],
  ["muted-foreground", "--muted-foreground"],
  ["accent", "--accent"],
  ["accent-foreground", "--accent-foreground"],
  ["destructive", "--destructive"],
  ["destructive-foreground", "--destructive-foreground"],
  ["border", "--border"],
  ["input", "--input"],
  ["ring", "--ring"],
  ["radius", "--radius"],
  ["capture", "--capture"],
  ["organized", "--organized"],
  ["completed", "--completed"],
] as const satisfies ReadonlyArray<
  readonly [keyof CompleteThemeMode, `--${string}`]
>;

interface InlineValue {
  value: string;
  priority: string;
}

const currentApplication = new WeakMap<HTMLElement, object>();

export function applyTheme(
  root: HTMLElement,
  tokens: CompleteThemeMode,
): () => void {
  const application = {};
  currentApplication.set(root, application);
  const previousValues = new Map<string, InlineValue>();

  for (const [, property] of CANONICAL_THEME_PROPERTIES) {
    previousValues.set(property, {
      value: root.style.getPropertyValue(property),
      priority: root.style.getPropertyPriority(property),
    });
  }

  const frame = requestAnimationFrame(() => {
    if (currentApplication.get(root) !== application) return;

    for (const [, property] of CANONICAL_THEME_PROPERTIES) {
      root.style.removeProperty(property);
    }
    for (const [token, property] of CANONICAL_THEME_PROPERTIES) {
      root.style.setProperty(property, tokens[token]);
    }
  });

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    cancelAnimationFrame(frame);
    if (currentApplication.get(root) !== application) return;

    currentApplication.delete(root);
    for (const [, property] of CANONICAL_THEME_PROPERTIES) {
      const previous = previousValues.get(property);
      if (previous === undefined || previous.value === "") {
        root.style.removeProperty(property);
      } else {
        root.style.setProperty(property, previous.value, previous.priority);
      }
    }
  };
}
