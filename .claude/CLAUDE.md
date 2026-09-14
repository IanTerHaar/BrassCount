# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BrassCount is an Android-first React Native + TypeScript app (React Native 0.86, React 19). No backend/API layer exists yet — all persistence is local via AsyncStorage.

## Commands

```bash
npm start                  # Metro bundler (run before `npm run android`)
npm run android             # Build & run debug APK on device/emulator
npm run android:release     # Build release APK
npm run android:bundle      # Build release AAB (Play Store)
npm run android:clean       # ./gradlew clean

npm test                    # Run all Jest tests
npm test -- sessionStorage  # Run tests matching a file/pattern
npm test -- --testNamePattern="saves a new session"
npm run test:ci              # Jest with coverage, CI reporter

npm run typecheck            # tsc --noEmit
npm run lint                  # ESLint, zero warnings allowed (--max-warnings=0)
npm run lint:fix
npm run format                # Prettier --write
npm run format:check
npm run lint:format            # lint:fix + format in one pass
```

Node.js 22+ is required (`engines` in package.json, pinned in CI). A JDK with `JAVA_HOME` set is required for Android builds.

Tests live in `__tests__/` at the repo root (not colocated with `src/`), using the `.test.ts` extension.

## Architecture

### Path aliases

All internal imports use `@/...` style aliases, defined in three places that must stay in sync: `babel.config.js` (module-resolver plugin), `tsconfig.json` (`paths`), and `jest.config.js` (`moduleNameMapper`):

`@` → `src`, `@components`, `@screens`, `@navigation`, `@hooks`, `@utils`, `@constants`, `@types`, `@services`, `@theme`. (`@store`, `@api`, `@assets` are also aliased but have no corresponding directory yet — there is no state-management library or API client in this codebase.)

### Directory layout (`src/`)

- `components/` — reusable UI primitives (Button, Card, TextField, Chip, ListRow, Typography, etc.), re-exported via `components/index.ts`
- `screens/` — full-screen views: `CalibrationScreen`, `DrillsScreen`, `TimerScreen`, `HistoryScreen`, `HistoryDetailScreen`, `ProfileScreen`, `SequenceEditorScreen`
- `navigation/` — `RootNavigator` (root stack), `MainTabs` (bottom tabs), `HistoryStack` (nested stack), `TabBar`
- `hooks/` — `useTheme()` / `useThemedStyles()` are the only sanctioned way to read design tokens in components
- `services/` — `storage.ts` (typed, namespaced AsyncStorage wrapper) and `sessionStorage.ts` (domain service built on top of it)
- `theme/theme.ts` — palette, spacing, radius, typography, and semantic `SemanticColors` for light/dark; both theme objects must share the same `SemanticColors` shape
- `types/` — `session.ts` (domain model), `navigation.ts` (`RootStackParamList`, `MainTabParamList`, `HistoryStackParamList`)
- `constants/` — static values (e.g. `previewData.ts`)

### Navigation

- `RootNavigator`: native-stack with `Tabs` (headerless, hosts `MainTabs`) and a modal-style `SequenceEditor` screen
- `MainTabs`: bottom tabs — `Calibration`, `Drills`, `Timer`, `History` (nested stack), `Profile`
- `HistoryStack`: `HistoryList` → `HistoryDetail`, kept as a nested stack specifically so the bottom tab bar stays visible when drilling into a run (a stack screen on the root stack would cover it)
- Screen param types live in `src/types/navigation.ts`; extend `RootStackParamList`/`MainTabParamList`/`HistoryStackParamList` there, not inline in screens

### Theming

- `useTheme()` resolves `light`/`dark` from the OS color scheme (`useColorScheme`) — there is no manual override yet, but all token access is meant to go through this hook so one can be added in one place later
- Components must reference semantic tokens (`theme.colors.textPrimary`, `theme.spacing.md`, ...), never the raw `palette` in `theme.ts`
- `useThemedStyles(factory)` memoizes a themed `StyleSheet`; define the `factory` function at module scope so it doesn't get recreated (and thus recomputed) every render
- `RootNavigator` maps the app theme onto React Navigation's `Theme` (`toNavigationTheme`) so header/card chrome matches instead of falling back to the library default
- Timer/metric text uses the `timer`/`metric`/`metricSmall` typography variants, which force a monospace `fontFamily` — digit values must use these so numbers don't jitter horizontally as they tick

### Persistence

- `services/storage.ts` is the only module that talks to `@react-native-async-storage/async-storage` directly. It exposes `createStorageNamespace<T>({ name, version })`, giving each domain a versioned key prefix (`@BrassCount:<name>:<version>:<id>`) with typed `setItem`/`getItem`/`getAll`/`clear`, etc. Storage failures are normalized to `StorageError`.
- Domain services (e.g. `sessionStorage.ts`) build on a namespace rather than importing AsyncStorage themselves. Bump a namespace's `version` (not the shape in place) when making a breaking change to a stored type, and write a migration that reads the old version.
- `sessionStorage.ts` stamps `createdAt`/`updatedAt` itself — callers never set these manually — and `loadSessions()` returns results sorted by `updatedAt` descending.

### Environment variables

`react-native-dotenv` is wired up in `babel.config.js` (module name `@env`, reads `.env`) with a `.env.example` template, but no code currently imports from `@env` — this is scaffolding for future config, not an active pattern to follow yet.

## Conventions

- **Commits/branches**: Conventional Commits, enforced by a Husky `commit-msg` hook — `<type>[(scope)]: <description>`, lowercase type, no trailing period. Valid types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`. Branch names follow the same `<type>: <kebab-case>` shape. PR titles are checked against the same format (soft check, non-blocking).
- **Pre-commit**: Husky + lint-staged runs ESLint `--fix` then Prettier on staged `.ts/.tsx/.js/.jsx`, and Prettier on staged `.json/.md/.yml/.yaml`. A commit is aborted if ESLint can't auto-fix everything.
- **Import order**: enforced by `eslint-plugin-import` — builtins, then external packages (React/React Native first), then internal `@/...` aliases, then parent/sibling/index — alphabetized within each group.
- **Type-only imports**: use `import type { ... }`.
- CI (`.github/workflows/`) runs lint, format check, typecheck, `test:ci`, and an Android debug build on every non-draft PR; all are skipped on draft PRs except the Android build.
