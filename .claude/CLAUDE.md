# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BrassCount is an Android-only React Native (0.86, React 19, TypeScript 6) shot-timer app for shooting drills: a randomised start beep, a running timer with per-step par times, drill/sequence editing, mic calibration, and run history. There is no `ios/` directory. Requires Node >= 22.11.

## Commands

```bash
npm start                  # Metro bundler
npm run android            # Build + run debug on device/emulator (needs JDK 17, JAVA_HOME)
npm run android:release    # Release APK (android:bundle for AAB, android:clean to clean)

npm test                   # Jest (single run, not watch mode)
npm test -- startSequence  # Single test file (path pattern)
npm test -- -t "waits the random delay"   # Tests matching a name
npm run test:ci            # Jest with coverage, as CI runs it
npm run android:test       # Kotlin JVM unit tests (gradlew testDebugUnitTest)

npm run typecheck          # tsc --noEmit
npm run lint               # ESLint, --max-warnings=0
npm run format:check       # Prettier check (CI gate)
npm run lint:format        # eslint --fix + prettier --write
```

Before pushing, the PR gate is: `lint`, `format:check`, `typecheck`, `test:ci`, plus the Kotlin unit tests (`testDebugUnitTest`) and an Android `assembleDebug` build. CI copies `.env.example` to `.env` before the Gradle build.

## Architecture

### Current state: UI is ahead of the data layer

The screens are a finished front-end pass rendered from **fixtures**, not real data. `src/constants/previewData.ts` holds both the display fixtures (`previewDrills`, `previewHistory`, `previewUser`) and, for now, the drill domain types and helpers (`DrillStep`, `SequenceAction`, `countShots`, `totalParSeconds`, `labelForStep`). Its header says to swap each `preview*` export for a real selector when the data layer lands, then delete the file.

`src/services/` is being built up one service at a time and wired into screens as each lands. So far only `StartSequenceService` is consumed by a screen (`TimerScreen`); `SessionStorageService` and `DrillStorageService` exist and are tested but no screen reads from them yet. The stored drill model is `src/types/drill.ts` (`Drill`, steps as `{ id, type, par }`); the screens still render the fixture shape (`{ action, parSeconds }`) until they are wired to it. The `Session` type in `src/types/session.ts` is a generic placeholder shape and does not yet match the drill/run types in `previewData.ts`.

There is no state-management library — screens use local `useState`/`useRef`. The one piece of shared state is calibration (see below). There is no `src/api/` despite the alias existing.

### Calibration state (`src/store/`)

Per-sound calibration (`shot`, `reload`, `rack`: threshold, status, last test reading) lives in a React Context: a pure reducer in `calibrationReducer.ts`, `CalibrationProvider` in `CalibrationContext.tsx` mounted in `App.tsx` above the navigators, read through `useCalibration()`. It is **deliberately in-memory only** and resets when the app is closed — do not persist it through `storage.ts`. Levels are dBFS, the unit `AmplitudeReading` reports, so a threshold compares directly with a live reading. Levels pass through `normalizeDbfs` before dispatch: anything below the -160 floor (silence reads as `-Infinity`) is raised to it, so a reading off the mic stream never throws, while `NaN` or a level above 0 throws `CalibrationError` as a caller bug. Keep the live microphone level out of this store; it changes many times a second.

### Services (`src/services/`)

- **`storage.ts`** — the only module that may touch AsyncStorage. `createStorageNamespace<T>({ name, version })` returns typed CRUD scoped to keys of the form `@BrassCount:<name>:<version>:<id>`. All failures surface as `StorageError`; corrupt JSON reads resolve to `null` / are skipped rather than throwing. Bump `version` and write a migration for breaking shape changes.
- **`sessionStorage.ts`** — domain service on top of a namespace. One key per session; stamps `createdAt`/`updatedAt` itself; `loadSessions()` returns newest-`updatedAt` first.
- **`drillStorage.ts`** — drills, one key per drill. `saveDrill` creates (the service generates the drill id and step ids), `updateDrill` changes an existing one and rejects with `NOT_FOUND` otherwise. It stamps timestamps and derives `totalPar` / `shotCount` through `src/utils/drill.ts`; `totalPar` is `null` when any step is untimed. Each stored value is a `{ schemaVersion, drill }` envelope: a `Drill` shape change bumps `DRILL_SCHEMA_VERSION` and upgrades older envelopes in `parseStoredDrill`. Reads are validated field by field and an entry that fails is skipped. The limits in `src/types/drill.ts` (`MAX_STEP_PAR_SECONDS`, `MAX_DRILL_STEPS`, `MAX_DRILL_NAME_LENGTH`) apply on save and read. Changes to stored drills are queued and run one at a time, so overlapping updates and deletes cannot lose an edit. Throws `DrillStorageError` (a `StorageError` with a `code`).
- **`beepPlayer.ts`** — `BeepPlayer` interface (`prepare`/`play`/`release`) with an oscillator implementation over `react-native-audio-api`'s `AudioContext`.
- **`startSequence.ts`** — waits a random delay (default 1000–4000 ms), plays the beep, resolves `{ startedAt, delayMs }`. `startedAt` is captured when the beep is triggered and is the timer's zero point. Cancellation is via `AbortSignal` and rejects with `StartSequenceAbortError` (distinct from `StartSequenceError`, which is a real failure).

Service conventions to follow when adding one: export plain functions **and** an object-form `XxxService` handle plus `XxxServiceType`; throw a named `Error` subclass carrying `cause`; accept collaborators (`player`, `random`, `signal`) through an options object so tests inject fakes instead of mocking modules. Re-export from `src/services/index.ts`.

### Navigation (`src/navigation/`)

Root native stack → `Tabs` (bottom tabs: Calibration, Drills, **Timer** as initial route, History, Profile) + `SequenceEditor` pushed over the tabs. The History tab is itself a nested stack (`HistoryList` → `HistoryDetail`) so the tab bar stays visible on the detail screen. All param lists live in `src/types/navigation.ts`, which also augments `ReactNavigation.RootParamList` globally.

Navigator headers are off everywhere: each screen renders its own header through the `Screen` component, and the bottom chrome is the custom `TabBar`. A new tab needs an entry in `tabIcons` in `TabBar.tsx`.

### Theming

`src/theme/theme.ts` defines a raw palette and semantic tokens (`colors`, `spacing`, `radius`, `typography`, `elevation`) for light and dark themes with an identical shape.

- Components never import the palette or theme objects directly (type-only `Theme` imports are fine). Get tokens from `useTheme()` so a manual theme override can later be added in one place.
- Styles are written as a module-scope `createStyles = (theme: Theme) => StyleSheet.create({...})` and consumed with `useThemedStyles(createStyles)`. The factory must be module-scope (or memoised) or the memo is defeated.
- Use spacing/radius tokens and `Typography` variants rather than literal numbers and ad hoc font sizes. Timer and metric readouts use the mono variants (`timer`, `metric`, `metricSmall`) so digits don't jitter.
- Adding a semantic color means adding it to `SemanticColors` and both `lightColors` and `darkColors`.

Screens are composed from the primitives in `src/components/` (`Screen`, `Card`, `ListRow`, `Chip`, `SectionHeader`, `Typography`, `Icon`, …). `Screen` owns safe area, padding, title/subtitle/back control, and bottom padding to clear the tab bar — pass `scrollable` for anything that can overflow.

## Conventions

### Path aliases

Aliases (`@/`, `@components/`, `@screens/`, `@navigation/`, `@hooks/`, `@utils/`, `@constants/`, `@types/`, `@services/`, `@store/`, `@api/`, `@assets/`) are declared in three places that must be kept in sync: `tsconfig.json`, `babel.config.js`, `jest.config.js`.

Existing usage: `@/theme/theme`, `@/types/...` and `@/screens` go through `@/`; everything else uses the specific alias and imports the concrete file (`@components/Card`, `@hooks/useTheme`), not the barrel. Tests import with relative paths (`../src/...`).

### Import order (lint-enforced, and warnings fail the build)

`react` first, then `react-native`, then other external packages, then internal aliases, then relative — each group separated by a blank line and alphabetised within the group. `npm run lint:fix` sorts them.

### ESLint config

ESLint 9 reads the flat config `eslint.config.js`, which pulls its `rules`, `settings` and ignore list out of `.eslintrc.js`. Edit rules in `.eslintrc.js`; edit file globs/parser options in `eslint.config.js`. Root config files are ignored by ESLint (and filtered out in `.lintstagedrc.js`) — add any new root config file to both lists.

### Tests

A behaviour change ships with unit tests in the same change: Jest for TypeScript / React Native, JVM unit tests for Kotlin under `android/`, and both when a native module's contract changes. See `.claude/rules/common/testing.md` and `.claude/rules/kotlin/testing.md` (Kotlin tests are plain JUnit 4 under `android/app/src/test/java/`, run with `testDebugUnitTest` locally and in CI; they cover the pure audio maths extracted from the native module, not its threading or lifecycle).

Tests live in `__tests__/` at the repo root. `jest.setup.js` globally mocks AsyncStorage (official in-memory mock), `react-native-audio-api` (its `/mock`), the app-local `NativeAudioCapture` spec and gesture-handler. Component tests use `react-test-renderer` with `act`, wrap in `SafeAreaProvider` with `initialMetrics`, and query by the `testID`s the screens expose (`btn-start`, `text-elapsed`, `tab-<Route>`, …). Timing-dependent tests use Jest fake timers with `jest.setSystemTime`.

### Commits, branches, PRs, versioning

- Commit subjects must match `<type>(optional-scope): <description>` — the husky `commit-msg` hook rejects anything else. Types: `feat`, `fix`, `add`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`.
- `pre-commit` runs lint-staged (`eslint --fix --max-warnings=0` + `prettier --write`) on staged files.
- Branches are `<type>/<kebab-description>` (e.g. `feat/start-sequence-service`). The Tests and Android build workflows only trigger on pushes to `main` and branches matching `feat*/*`, `fix*/*`, `chore*/*`, `refactor*/*`, `build*/*`, `test*/*`, `ci*/*`.
- PR titles use the same conventional format. Fill in the PR template's "Type of Change" checkboxes — the autolabeler reads them.
- **Never hand-edit version numbers.** On merge to `main` a bot bumps `package.json`, `package-lock.json` and `VERSION.txt` and creates a `v*` tag. The bump is a patch unless the PR title contains `#minor` or `#major` (e.g. `feat(timer): add start beep #minor`).

## Known stale spots

- `.github/copilot-instructions.md` describes a Zustand store, `src/store/`, `src/api/`, a `counterStore` test and a `__mocks__/` directory — none of these exist. Don't treat it as a description of the current code.
- `docs/CONTRIBUTING.md` shows branch names as `feat: short-description`; the real convention is the slash form above.
- `react-native-dotenv` is configured (`import { X } from '@env'`), but nothing imports `@env` yet and the files its aliases point to (`__mocks__/@env.js` for Jest, `src/types/env.d.ts` for TypeScript) don't exist — create both when first using it.
