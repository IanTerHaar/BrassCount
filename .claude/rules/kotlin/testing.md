---
paths:
  - '**/*.kt'
  - '**/*.kts'
---

# Kotlin Testing

> This file extends [common/testing.md](../common/testing.md) with Kotlin-specific content.

## Current State

There are no Kotlin tests and no Android test source sets (`android/app/src/test`, `androidTest`) in this project — the only Kotlin is the unmodified React Native host. CI verifies native code by compiling it (`assembleDebug`). All behavioural testing happens in Jest on the TypeScript side.

Do not add a Kotlin test framework speculatively. It becomes worthwhile when a native module contains real logic of its own.

## When a Native Module Is Added

1. **Keep logic testable without Android.** Put calculations (thresholding, peak detection, debouncing) in plain Kotlin classes with no `android.*` or React Native imports, so they run as local JVM unit tests.
2. **Use local unit tests first**: JUnit under `android/app/src/test/`, run with `cd android && gradlew testDebugUnitTest`. Add the dependency and a CI step in the same change.
3. **Test the JS contract in Jest**: mock the native module in `jest.setup.js` and test the `src/services/` wrapper — error-code mapping, event handling, cleanup.
4. **Verify the real thing on a device.** Audio capture, permissions and timing cannot be meaningfully unit tested; write down the manual check in the PR.

## Conventions

- Prefer hand-written fakes over a mocking framework.
- Use backtick-quoted descriptive names:

```kotlin
@Test
fun `peak below threshold is not reported as a shot`() { }
```

- For coroutine code, use `kotlinx-coroutines-test` (`runTest`) rather than real delays.

See skill: `kotlin-testing` for framework-specific patterns if a framework is adopted.
