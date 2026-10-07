---
paths:
  - '**/*.kt'
  - '**/*.kts'
---

# Kotlin Testing

> This file extends [common/testing.md](../common/testing.md) with Kotlin-specific content.

## Requirement

A change to Kotlin logic under `android/` ships with JVM unit tests in the same change — the same rule as TypeScript, with a different tool. Compiling (`assembleDebug`) is not a test.

"Logic" means anything with a right and a wrong answer: level / dB / peak maths, timestamp arithmetic, choosing between options (an audio source, a fallback order), state transitions, mapping failures to error codes. Glue that only forwards to an Android API is exempt from unit tests but not from the device check below.

## Current State

The audio native module lives in `android/app/src/main/java/com/brasscount/app/audio/`, split so its logic is testable:

| File                       | Holds                                                                                                                                                                             | Kotlin tests                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `AudioLevels.kt`           | Pure: capture-format constants, `Reading`, `computeReading` (RMS, dBFS floor/ceiling, peak and its timestamp, nanos → ms), `normalize`, `toDbfs`, `captureBufferSizeBytes`        | `AudioLevelsTest`                                      |
| `AudioSourcePreference.kt` | Pure: `AudioSourceKind` and `audioSourcesByPreference(supportsUnprocessed)`                                                                                                       | `AudioSourcePreferenceTest`                            |
| `AudioCaptureModule.kt`    | Android glue: `AudioRecord`, the capture thread, start/stop/pause state and locking, permission and foreground checks, mapping `AudioSourceKind` to `MediaRecorder.AudioSource.*` | **None** — needs a device; see "How to Write Them" (4) |

- Still untested in Kotlin: threading and lifecycle (start/stop races, `onHostPause`, the read loop's exit paths), promise rejection codes, and real audio.
- The JS side of the module's contract is tested in Jest (`__tests__/audioCapture.test.ts`).

## How It Is Set Up

- `testImplementation("junit:junit:4.13.2")` in `android/app/build.gradle` — plain JUnit 4, no mocking framework.
- Tests live under `android/app/src/test/java/com/brasscount/app/…`, mirroring the package of the code under test. They can call `internal` declarations from `src/main`.
- CI (`.github/workflows/build.yml`) runs `./gradlew --no-daemon testDebugUnitTest` before `assembleDebug`.
- Results are written to `android/app/build/test-results/testDebugUnitTest/*.xml` and an HTML report to `android/app/build/reports/tests/testDebugUnitTest/`.

When adding tests for a new area, update "Current State" above.

Kotlin unit tests are a requirement from the project owner (2026-10-07). Anything beyond plain JUnit — MockK, Kotest, Robolectric, instrumented `androidTest` — is still a decision for the user.

## How to Write Them

1. **Keep logic testable without Android.** Put calculations and decisions in plain Kotlin classes or top-level functions with no `android.*` or React Native imports, and have the module call them. Local JVM tests cannot construct `AudioRecord` or a `ReactApplicationContext`, so logic left inside the module is untestable — extract it first.
2. **Run them** with `cd android && gradlew testDebugUnitTest` (`./gradlew` in Git Bash or CI).
3. **Test the JS contract in Jest too** when events, error codes or method signatures change: the native module is mocked in `jest.setup.js` and the `src/services/` wrapper is tested for error-code mapping, event handling and cleanup.
4. **Verify the real thing on a device.** Audio capture, permissions, lifecycle and timing cannot be meaningfully unit tested; list the manual checks in the final message and in the PR.

## Conventions

- Prefer hand-written fakes over a mocking framework.
- Use backtick-quoted descriptive names that state the behaviour:

```kotlin
@Test
fun `peak below threshold is not reported as a shot`() { }
```

- For coroutine code, use `kotlinx-coroutines-test` (`runTest`) rather than real delays.

See skill: `kotlin-testing` for framework-specific patterns if a framework beyond JUnit is adopted.
