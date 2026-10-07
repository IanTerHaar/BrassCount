---
paths:
  - '**/*.ts'
  - '**/*.tsx'
---

# React Native Performance

> Runtime performance of the app. Tooling and build troubleshooting is in [common/performance.md](../common/performance.md).

## Timing Accuracy Comes First

This is a shot timer: displayed and recorded times must be correct to the hundredth of a second.

- Derive elapsed time from timestamps, not from accumulated interval ticks — intervals drift and are throttled under load.
- Keep the JS thread free while a run is active: no storage writes, heavy parsing or large re-renders between the start signal and the last recorded event.
- Persist results after the run ends, not during it.

## Rendering

- Keep fast-changing state (the running clock) as low in the tree as possible so a tick re-renders only the readout, not the whole screen.
- Memoize with `React.memo` / `useCallback` / `useMemo` only where it prevents real re-renders; do not memoize by default.
- Avoid new objects, arrays or functions inline in props on hot paths — they defeat memoization.
- Declare `createStyles` at module scope; an inline factory makes `useThemedStyles` recompute every render.

## Lists

- `FlatList` / `SectionList` for anything unbounded, with `keyExtractor` and a memoized `renderItem`.
- Tune `initialNumToRender`, `windowSize` and `maxToRenderPerBatch` only after measuring a problem.

## Storage

- `loadSessions()` reads and parses every stored session. Load once per screen visit, not on every render or tick.
- Writes are one key per item; keep it that way rather than rewriting a whole collection for a single change.

## Animations

- No animation library is installed. For simple effects use the built-in `Animated` API with `useNativeDriver: true`.
- Anything gesture-driven or continuous would justify `react-native-reanimated`; raise it with the user before adding it.

## Runtime & Build

- The app runs on the New Architecture with Hermes (React Native 0.86 defaults). Every native dependency must be New-Architecture compatible.
- Defer non-critical work until after first paint; use `InteractionManager.runAfterInteractions` for work that can wait for transitions.

## Measuring

- Profile before optimizing: React Native DevTools profiler and the in-app performance monitor.
- Judge performance on a release build (`npm run android:release`) on a physical device — debug builds are much slower and not representative.
