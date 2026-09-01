# Feedback Noise Reduction and Bundled Themes

## Goal

Make Kopper quieter by removing confirmations for changes whose result is already visible, while retaining feedback that resolves genuine uncertainty. Add two expressive bundled themes without changing shadcn primitives or creating a second component styling system.

## Feedback policy

Use outcome visibility as the rule:

- Remove success feedback for state changes already reflected by the interface: appearance mode changes, theme activation and deletion, pin changes, shortcut saves and resets, and imported-theme activation.
- Remove cancellation notices for shortcut recording and native file pickers. A cancellation that leaves state unchanged needs no acknowledgement.
- Keep feedback for outcomes that are otherwise invisible or operationally significant: clipboard copies, capture attempts, data and theme exports, data imports, accessibility repair, and recovery operations.
- Keep pending feedback when it explains an ongoing operation, including shortcut recording, capture testing, and accessibility work.
- Keep empty-result messages such as a capture finding no selected text.
- Keep every controlled error and failure message.

This policy applies to both transient panel toasts and settings-local feedback. Existing status semantics that communicate current state to assistive technology are not treated as toast noise.

## Bundled themes

Keep `Default` as the initial and fallback bundled theme. Add two bundled accent themes:

- `Cobalt`: neutral shadcn surfaces with a precise blue primary and matching focus ring.
- `Violet`: the same neutral surface hierarchy with a richer violet primary and matching focus ring.

Both themes:

- Use the existing semantic theme-token contract for light and dark modes.
- Retain the fixed system radius and derive capture/lifecycle compatibility values from core semantic tokens.
- Keep neutral background, card, popover, secondary, muted, border, input, and destructive roles compatible with the current shadcn New York foundation.
- Change color tokens only; they do not change component classes, typography, dimensions, spacing, borders, radii, or elevation.
- Must pass the repository's contrast validation for required foreground/background pairs.

Custom themes remain supported. Existing legacy bundled IDs continue resolving to `Default`; the new bundled IDs resolve to their own definitions.

## Component boundaries

- Do not modify files under `src/renderer/src/components/ui`.
- Do not modify the global shadcn/Tailwind design-system foundation to implement the new themes.
- Keep feedback presentation on existing `Toast`, `Alert`, and settings feedback surfaces; only change when those surfaces are invoked.
- Keep IPC channels, persisted document schemas, theme-file version, and custom-theme behavior unchanged.

## Verification

- Update feedback tests to prove redundant success and cancellation notices are absent while invisible outcomes, progress, empty results, and errors remain.
- Add bundled-theme tests for identifiers, lookup, light/dark semantic values, contrast validation, fallback behavior, and legacy aliases.
- Verify custom-theme activation and editing remain unchanged.
- Audit the diff to prove shadcn primitive files are byte-for-byte untouched.
- Run focused Vitest tests, the full test suite, typecheck, and build.
