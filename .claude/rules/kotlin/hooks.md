---
paths:
  - '**/*.kt'
  - '**/*.kts'
  - '**/*.gradle'
---

# Kotlin Hooks

> This file extends [common/hooks.md](../common/hooks.md) with Kotlin-specific content.

No hook runs for Kotlin or Gradle files: the edit hook skips everything under `android/`, and there is no Kotlin linter or formatter in the project. Verification is manual.

## After Changing Kotlin, the Manifest or Gradle Files

| Check                        | Command                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Kotlin unit tests (CI runs)  | `cd android && gradlew testDebugUnitTest`                                      |
| Compiles and runs            | `npm run android` (needs JDK 17, `JAVA_HOME`, and a device or emulator)        |
| Compiles only (what CI runs) | `cd android && gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`     |
| Stale build output           | `npm run android:clean`, then rebuild                                          |
| Release build still works    | `npm run android:release` — required after ProGuard / R8 or dependency changes |

A Metro reload does not pick up native changes; the app must be rebuilt and reinstalled.

## Notes

- Do not wire Gradle into edit-time hooks — a build takes minutes.
- Use `gradlew` in the npm scripts' form on Windows and `./gradlew` in Git Bash or CI.
