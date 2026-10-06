# Common Patterns

These are the patterns the codebase already uses. Follow them when adding code; `.claude/CLAUDE.md` describes where each one lives.

## Service Modules (`src/services/`)

A service is a plain module, not a class:

- Export the functions individually **and** an object-form handle (`SessionStorageService`) plus its type (`SessionStorageServiceType`).
- Throw a named `Error` subclass that carries the underlying failure as `cause`, so UI code catches one type.
- Take collaborators and sources of non-determinism (a player, `random`, an `AbortSignal`) through an options object with defaults, so tests inject fakes instead of mocking modules.
- Re-export from `src/services/index.ts`.

## Storage Namespaces (Repository Pattern)

Persistence goes through `createStorageNamespace<T>({ name, version })` in `src/services/storage.ts` — it is the only module that touches AsyncStorage.

- One domain service per namespace (`sessionStorage.ts` for sessions) exposes the CRUD-style API: save, load all, load by id, delete by id, clear.
- Keys are `@BrassCount:<name>:<version>:<id>`, one key per item.
- The domain service owns timestamps and sorting; screens never build keys or parse JSON.
- A breaking change to a stored shape means bumping `version` and writing a migration that reads the previous version's keys.

## Themed Styles

- Declare `const createStyles = (theme: Theme) => StyleSheet.create({ … })` at module scope and consume it with `useThemedStyles(createStyles)`.
- Read tokens from `useTheme()`; never import the palette or the theme objects into a component.

## Screen Composition

- A screen renders inside the `Screen` shell, which owns the safe area, padding, header and tab-bar clearance.
- Build from the primitives in `src/components/` before writing new layout code.
- Navigator headers stay off; route params are typed in `src/types/navigation.ts`.

## Display Fixtures

`src/constants/previewData.ts` holds temporary fixtures and, for now, the drill domain types. When wiring a screen to real data, replace the `preview*` import with the real source and move any type that outlives the fixture into `src/types/`.
