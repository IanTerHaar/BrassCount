---
paths:
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - '**/*Test.kt'
---

# Testing Rules

- Use descriptive test names: "should [expected] when [condition]"
- Mock external dependencies, not internal modules
- Clean up side effects in afterEach
- TS/TSX tests live in `__tests__/` at the repo root, not colocated next to the source file under `src/`

## Kotlin (Android native)

- JVM unit tests (JUnit4, no Android framework/device deps) live under `android/app/src/test/java/...`; instrumented tests that need a device/emulator live under `android/app/src/androidTest/java/...`
- Mirror the package path of the class under test and name the file `<ClassName>Test.kt`
- Use descriptive test method names in backtick form: `` `returns X when Y`() ``
- Mock external dependencies (Android framework classes, hardware/audio APIs) with Mockito/MockK, not internal modules
- Clean up side effects (e.g. released resources, registered listeners) in `@After`
- Run via `./gradlew testDebugUnitTest` (JVM unit tests) or `./gradlew connectedDebugAndroidTest` (instrumented tests)
