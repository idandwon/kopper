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

interface Application {
  frame: number;
}

interface RootThemeState {
  baseline: Map<string, InlineValue>;
  current?: Application;
  restorationFrame?: number;
}

const rootStates = new WeakMap<HTMLElement, RootThemeState>();

function captureBaseline(root: HTMLElement): Map<string, InlineValue> {
  const values = new Map<string, InlineValue>();
  for (const [, property] of CANONICAL_THEME_PROPERTIES) {
    values.set(property, {
      value: root.style.getPropertyValue(property),
      priority: root.style.getPropertyPriority(property),
    });
  }
  return values;
}

function restoreBaseline(root: HTMLElement, baseline: Map<string, InlineValue>) {
  for (const [, property] of CANONICAL_THEME_PROPERTIES) {
    const previous = baseline.get(property);
    if (previous === undefined || previous.value === "") {
      root.style.removeProperty(property);
    } else {
      root.style.setProperty(property, previous.value, previous.priority);
    }
  }
}

export function applyTheme(
  root: HTMLElement,
  tokens: CompleteThemeMode,
): () => void {
  let state = rootStates.get(root);
  if (state === undefined) {
    state = { baseline: captureBaseline(root) };
    rootStates.set(root, state);
  }

  if (state.restorationFrame !== undefined) {
    cancelAnimationFrame(state.restorationFrame);
    state.restorationFrame = undefined;
  }
  if (state.current !== undefined) cancelAnimationFrame(state.current.frame);

  const application: Application = { frame: 0 };
  state.current = application;
  application.frame = requestAnimationFrame(() => {
    if (rootStates.get(root)?.current !== application) return;
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
    cancelAnimationFrame(application.frame);
    const currentState = rootStates.get(root);
    if (currentState?.current !== application) return;

    currentState.current = undefined;
    const restorationFrame = requestAnimationFrame(() => {
      const latestState = rootStates.get(root);
      if (
        latestState !== currentState ||
        latestState.current !== undefined ||
        latestState.restorationFrame !== restorationFrame
      ) {
        return;
      }
      restoreBaseline(root, latestState.baseline);
      rootStates.delete(root);
    });
    currentState.restorationFrame = restorationFrame;
  };
}
