# Coding Style

## Immutability (CRITICAL)

Create new objects, never mutate existing ones: update functions return a new copy.

## File Organization

- 200-400 lines typical; 800 is a soft ceiling for source files (test, generated and vendored files may exceed it).
- Functions under ~50 lines, nesting under 4 levels (prefer early returns), components past ~200 lines get subcomponents or hooks.
- Follow the existing `src/` layout rather than introducing a new scheme.

## Error Handling

- Handle errors explicitly at every level; never swallow one silently. When ignoring is deliberate (e.g. skipping a corrupt stored entry), say why in a comment.
- UI-facing code shows user-friendly messages through screen state, not `console`.
- Services throw a named `Error` subclass carrying the original failure as `cause` (see `StorageError`).

## Input Validation

Validate at system boundaries: user input, values read back from AsyncStorage, navigation params. Fail fast with clear errors. No schema library is installed; use explicit guards and raise it with the user before adding one.

## Constants

Named constants for thresholds, delays and limits. For anything visual use theme tokens, not literals.
