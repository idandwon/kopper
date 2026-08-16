import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  AppearanceMode,
  ThemeDefinition,
} from "../../../shared/domain/document";
import {
  getThemeById,
  OXIDE_LEDGER_THEME,
} from "../../../shared/theme/presets";
import { useKopperDocument } from "../app/DocumentProvider";
import { applyTheme } from "./applyTheme";

export interface ThemeContextValue {
  resolvedMode: "light" | "dark";
  activeTheme: ThemeDefinition;
  previewTheme(theme: ThemeDefinition): void;
  cancelPreview(): void;
  savePreview(theme: ThemeDefinition): Promise<boolean>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveMode(
  mode: AppearanceMode,
  nativeDark: boolean,
): "light" | "dark" {
  if (mode === "system") return nativeDark ? "dark" : "light";
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { document: kopperDocument, ready, execute } = useKopperDocument();
  const [nativeDark, setNativeDark] = useState(false);
  const [preview, setPreview] = useState<ThemeDefinition | null>(null);

  useEffect(() => {
    let mounted = true;
    let receivedEvent = false;
    const unsubscribe = window.kopper.onNativeAppearanceChanged(
      (useDarkColors) => {
        if (!mounted) return;
        receivedEvent = true;
        setNativeDark(useDarkColors);
      },
    );

    void window.kopper.getNativeAppearance().then(
      (result) => {
        if (!mounted || receivedEvent || !result.ok) return;
        setNativeDark(result.value);
      },
      () => undefined,
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const appearanceMode = ready ? kopperDocument.appearance.mode : "system";
  const resolvedMode = resolveMode(appearanceMode, nativeDark);
  const persistedTheme = useMemo(
    () =>
      ready
        ? (getThemeById(
            kopperDocument,
            kopperDocument.appearance.activeThemeId,
          ) ?? OXIDE_LEDGER_THEME)
        : OXIDE_LEDGER_THEME,
    [kopperDocument, ready],
  );
  const activeTheme = ready ? (preview ?? persistedTheme) : OXIDE_LEDGER_THEME;

  useLayoutEffect(() => {
    const root = globalThis.document.documentElement;
    const previouslyDark = root.classList.contains("dark");
    const previousColorScheme = root.style.getPropertyValue("color-scheme");
    const previousColorSchemePriority =
      root.style.getPropertyPriority("color-scheme");

    root.classList.toggle("dark", resolvedMode === "dark");
    root.style.setProperty("color-scheme", resolvedMode);
    const cleanupTheme = applyTheme(root, activeTheme[resolvedMode]);

    return () => {
      cleanupTheme();
      root.classList.toggle("dark", previouslyDark);
      if (previousColorScheme === "") {
        root.style.removeProperty("color-scheme");
      } else {
        root.style.setProperty(
          "color-scheme",
          previousColorScheme,
          previousColorSchemePriority,
        );
      }
    };
  }, [activeTheme, resolvedMode]);

  const previewTheme = useCallback((theme: ThemeDefinition) => {
    setPreview(theme);
  }, []);

  const cancelPreview = useCallback(() => {
    setPreview(null);
  }, []);

  const savePreview = useCallback(
    async (theme: ThemeDefinition): Promise<boolean> => {
      const upserted = await execute({
        type: "appearance.upsertCustomTheme",
        theme,
      });
      if (!upserted) return false;

      const activated = await execute({
        type: "appearance.setActiveTheme",
        themeId: theme.id,
      });
      if (!activated) return false;

      setPreview(null);
      return true;
    },
    [execute],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      resolvedMode,
      activeTheme,
      previewTheme,
      cancelPreview,
      savePreview,
    }),
    [activeTheme, cancelPreview, previewTheme, resolvedMode, savePreview],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
