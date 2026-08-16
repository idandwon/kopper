import type { ThemeDefinition } from "../domain/document";
import type { KopperError, Result } from "../domain/errors";
import { validateReadableTheme } from "./deriveTheme";
import { THEME_FILE_SCHEMA_URL } from "./themeSchema";

/** Validates invariants for an already schema-parsed persisted custom theme. */
export function validatePersistedCustomTheme(
  theme: ThemeDefinition,
): Result<ThemeDefinition, KopperError> {
  if (theme.id.startsWith("builtin:")) {
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "Custom theme identifiers cannot use the reserved builtin namespace.",
        retryable: false,
      },
    };
  }

  const readable = validateReadableTheme({
    $schema: THEME_FILE_SCHEMA_URL,
    version: theme.version,
    name: theme.name,
    light: theme.light,
    dark: theme.dark,
  });
  if (!readable.ok) return readable;
  return { ok: true, value: theme };
}
