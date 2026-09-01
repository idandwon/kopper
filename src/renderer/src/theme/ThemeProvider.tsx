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
  SHADCN_DEFAULT_THEME,
} from "../../../shared/theme/presets";
import { useKopperDocument } from "../app/DocumentProvider";
import { applyTheme } from "./applyTheme";

export type ThemeSaveResult =
  | { status: "saved" }
  | { status: "upsert_failed" }
  | { status: "activation_failed" };

export type ThemePreviewOwner = symbol;

export interface ThemeContextValue {
  resolvedMode: "light" | "dark";
  activeTheme: ThemeDefinition;
  previewTheme(
    owner: ThemePreviewOwner,
    theme: ThemeDefinition,
    modeOverride?: "light" | "dark",
  ): void;
  cancelPreview(owner: ThemePreviewOwner): void;
  savePreview(
    owner: ThemePreviewOwner,
    theme: ThemeDefinition,
    modeOverride?: "light" | "dark",
  ): Promise<ThemeSaveResult>;
}

interface ThemePreview {
  readonly owner: ThemePreviewOwner;
  readonly theme: ThemeDefinition;
  readonly modeOverride?: "light" | "dark";
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
  const [preview, setPreview] = useState<ThemePreview | null>(null);

  useEffect(() => {
    const lifecycle = { mounted: true, receivedEvent: false };
    const unsubscribe = window.kopper.onNativeAppearanceChanged(
      (useDarkColors) => {
        if (!lifecycle.mounted) return;
        lifecycle.receivedEvent = true;
        setNativeDark(useDarkColors);
      },
    );

    void window.kopper.getNativeAppearance().then(
      (result) => {
        const canApplyInitialAppearance =
          lifecycle.mounted && !lifecycle.receivedEvent && result.ok;
        if (!canApplyInitialAppearance) return;
        setNativeDark(result.value);
      },
      () => undefined,
    );

    return () => {
      lifecycle.mounted = false;
      unsubscribe();
    };
  }, []);

  const appearanceMode = ready ? kopperDocument.appearance.mode : "system";
  const persistedResolvedMode = resolveMode(appearanceMode, nativeDark);
  const previewMode = preview === null ? undefined : preview.modeOverride;
  const resolvedMode = previewMode ?? persistedResolvedMode;
  const persistedTheme = useMemo(
    () =>
      ready
        ? (getThemeById(
            kopperDocument,
            kopperDocument.appearance.activeThemeId,
          ) ?? SHADCN_DEFAULT_THEME)
        : SHADCN_DEFAULT_THEME,
    [kopperDocument, ready],
  );
  const activeTheme =
    !ready || preview === null ? persistedTheme : preview.theme;

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

  const previewTheme = useCallback(
    (
      owner: ThemePreviewOwner,
      theme: ThemeDefinition,
      modeOverride?: "light" | "dark",
    ) => {
      setPreview({ owner, theme, modeOverride });
    },
    [],
  );

  const cancelPreview = useCallback((owner: ThemePreviewOwner) => {
    setPreview((current) =>
      current !== null && current.owner === owner ? null : current,
    );
  }, []);

  const savePreview = useCallback(
    async (
      owner: ThemePreviewOwner,
      theme: ThemeDefinition,
      modeOverride?: "light" | "dark",
    ): Promise<ThemeSaveResult> => {
      // The exact immutable wrapper is the authoritative save state, allowing
      // a newer owner, same-ID theme, or mode preview to survive acknowledgment.
      const savingPreview: ThemePreview = { owner, theme, modeOverride };
      setPreview(savingPreview);
      const upserted = await execute({
        type: "appearance.upsertCustomTheme",
        theme,
      });
      if (!upserted) return { status: "upsert_failed" };

      const activated = await execute({
        type: "appearance.setActiveTheme",
        themeId: theme.id,
      });
      if (!activated) return { status: "activation_failed" };

      setPreview((current) => (current === savingPreview ? null : current));
      return { status: "saved" };
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

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
