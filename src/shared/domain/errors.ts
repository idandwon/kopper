export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type KopperErrorCode =
  | "invalid_document"
  | "unsupported_schema"
  | "read_failed"
  | "write_failed"
  | "validation_failed"
  | "permission_denied"
  | "capture_timeout"
  | "capture_failed"
  | "nothing_selected"
  | "shortcut_conflict";

export interface ThemeContrastFailure {
  mode: "light" | "dark";
  backgroundToken: "background" | "card" | "popover" | "primary" | "accent";
  foregroundToken:
    | "foreground"
    | "card-foreground"
    | "popover-foreground"
    | "primary-foreground"
    | "accent-foreground";
  ratio: number;
}

export interface KopperError {
  code: KopperErrorCode;
  message: string;
  retryable: boolean;
  recoveryAction?: "retry" | "open_settings" | "choose_file" | "create_store";
  failures?: ThemeContrastFailure[];
  opaqueBackgroundModes?: Array<"light" | "dark">;
}
