# CLAUDE.md

<!-- Budget: 8 KB (enforced by npm run check:memory). Only what can't be derived from code:
commands, invariants, gotchas. Feature behaviour goes in a path-scoped rule or a code comment, never here. -->

## What this is

BrassCount is an Android-only React Native (0.86, React 19, TypeScript 6) shot-timer app for shooting drills: a randomised start beep, a running timer with per-step par times, drill editing, mic calibration, and run history. There is no `ios/` directory and no backend. Requires Node >= 22.11.

## Commands

```bash
npm start                  # Metro bundler
npm run android            # Build + run debug (needs JDK 17, JAVA_HOME)
npm run android:release    # Release APK (android:bundle for AAB, android:clean to clean)

npm test                   # Jest, single run
npm test -- startSequence  # One test file (path pattern)
npm test -- -t "waits"     # Tests matching a name
npm run test:ci            # Jest with coverage, as CI runs it
npm run android:test       # Kotlin JVM unit tests (gradlew testDebugUnitTest)

npm run typecheck          # tsc --noEmit
npm run lint               # ESLint, --max-warnings=0
npm run format:check       # Prettier check (CI gate)
npm run lint:format        # eslint --fix + prettier --write
```

PR gate: `lint`, `format:check`, `typecheck`, `test:ci`, Kotlin `testDebugUnitTest`, and an Android `assembleDebug` build. CI copies `.env.example` to `.env` before Gradle.

## Architecture

Every screen reads real data through a service. There are no display fixtures (`src/constants/` is empty, though the alias stays) and no `src/api/` (alias only).

- `src/services/` — storage (`storage.ts`, `drillStorage.ts`, `sessionStorage.ts`, `profileStorage.ts`) and audio/timing (`audioCapture.ts`, `beepPlayer.ts`, `startSequence.ts`, `calibrationCapture.ts`, `drillRunEngine.ts`). Conventions: [patterns.md](rules/common/patterns.md).
- `src/utils/` — pure rules, tested directly. Detection rules are in `runDetection.ts`, calibration maths in `calibration.ts`, history figures in `history.ts`, drill editing in `drillDraft.ts`. Read the file's header before changing a rule.
- `src/hooks/` — screen logic (`useDrillRun`, `useRunSave`, `useDrills`, `useDrillEditor`, `useDrillHistory`, `useDrillRuns`, `useRunComparison`, `useCalibrationCapture`, …).
- `src/types/` — stored models (`Drill`, `Session`, `Profile`), run types, and all navigation param lists (`navigation.ts`).
- `src/screens/`, `src/components/` — screens compose the primitives in `components/`.

Navigation: root native stack → `Tabs` (Calibration, Drills, **Timer** initial, History, Profile) plus `SequenceEditor` pushed over the tabs. History is a nested stack (`HistoryList` → `HistoryDetail` → `RunComparison`) so the tab bar stays visible. Navigator headers are off: each screen renders its own through `Screen`, and the bottom chrome is the custom `TabBar` (a new tab needs an entry in `tabIcons`).

### Invariants

- **State.** No state-management library: screens use `useState`/`useRef`. The only shared state is calibration and the Appearance preference, both React Context in `src/store/`.
- **Calibration is deliberately in-memory only.** It resets when the app closes; do not persist it through `storage.ts`. Levels are dBFS and pass through `normalizeDbfs`. Keep the live microphone level out of the store.
- **Appearance** is read once from the profile; `AppearanceProvider` renders nothing until it has. Components get the resolved theme only from `useTheme()`.
- **Persistence.** Only `storage.ts` touches AsyncStorage. Stored shapes are `{ schemaVersion, … }` envelopes: a shape change bumps the version and upgrades older envelopes on read. Reads are validated field by field and a bad entry is skipped. Drill and profile changes go through a serial queue.
- **Sessions** are never updated after saving. Deleting a drill leaves its sessions stored with a `drillId` that no longer resolves; history shows them as `DELETED_DRILL_NAME`.
- **Timing** uses the readings' own capture-clock timestamps, never the time a reading reaches JS. Nothing about a run is stored until the shooter saves it.
- **Detection is level-only**: any sound at least as loud as the expected step's threshold counts as that step.
- **Android touchables** that are both rotated and given a `hitSlop` stop receiving presses, so rotate an inner view instead.
- `react-native-reanimated` is not installed. Swipes use gesture-handler with the built-in `Animated`.

### Theming

`src/theme/theme.ts` holds the palette and semantic tokens for light and dark (identical shape). Components never import it, only type-only `Theme`. Use `useTheme()` and module-scope `createStyles = (theme: Theme) => StyleSheet.create(...)` with `useThemedStyles`. Use spacing/radius tokens and `Typography` variants, and the mono variants (`timer`, `metric`, `metricSmall`) for readouts. A new semantic colour goes in `SemanticColors` and both palettes.

## Conventions

### Path aliases

`@/`, `@components/`, `@screens/`, `@navigation/`, `@hooks/`, `@utils/`, `@constants/`, `@types/`, `@services/`, `@store/`, `@api/`, `@assets/` are declared in `tsconfig.json`, `babel.config.js` and `jest.config.js`; keep all three in sync. Theme, types and screens import through `@/` (`@/theme/theme`); everything else uses the specific alias and the concrete file, not the barrel. Tests use relative paths.

### Lint

Import order is enforced and warnings fail the build: `react`, `react-native`, other packages, internal aliases, relative, each group alphabetised and separated by a blank line (`npm run lint:fix` sorts them). ESLint 9 reads `eslint.config.js` (globs, parser) which pulls rules from `.eslintrc.js`; edit rules there. New root config files go in the ignore lists (see [hooks.md](rules/common/hooks.md)).

### Tests

A behaviour change ships with tests in the same change: see [testing.md](rules/common/testing.md). `jest.setup.js` globally mocks AsyncStorage, `react-native-audio-api`, `NativeAudioCapture` and gesture-handler. Anything rendering `SwipeableRow` needs a `GestureHandlerRootView`; Jest's font scale is 2.

### Git, PRs, versioning

See [git-workflow.md](rules/common/git-workflow.md). Never hand-edit version numbers; a bot bumps them on merge.

### Environment

`react-native-dotenv` is configured (`import { X } from '@env'`) but unused. Its Jest mock (`__mocks__/@env.js`) and types (`src/types/env.d.ts`) don't exist yet; create both when first using it.
