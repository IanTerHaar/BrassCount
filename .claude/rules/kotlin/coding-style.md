---
paths:
  - '**/*.kt'
  - '**/*.kts'
---

# Kotlin Coding Style

> This file extends [common/coding-style.md](../common/coding-style.md) with Kotlin-specific content.
> Kotlin in this repo is the Android host of a React Native app (`android/app/src/main/java/com/brasscount/app/`): today only `MainActivity.kt` and `MainApplication.kt`, plus any native modules added later. Application logic belongs in TypeScript; reach for Kotlin only when a platform API is not available from JS.

## Formatting

- Match the existing files: 2-space indentation, expression bodies for one-liners, trailing commas in multi-line argument lists.
- No Kotlin linter or formatter (ktlint, detekt, ktfmt) is configured, and Prettier does not touch `.kt` files — formatting is manual. Do not add one without the user deciding to.
- Kotlin version is pinned by `kotlinVersion` in `android/build.gradle`.

## Immutability

- Prefer `val` over `var` — use `var` only when mutation is required
- Use `data class` for value types; expose immutable collections (`List`, `Map`, `Set`) from public APIs
- Copy-on-write for state updates: `state.copy(field = newValue)`

## Naming

- `camelCase` for functions and properties
- `PascalCase` for classes, interfaces, objects and type aliases
- `SCREAMING_SNAKE_CASE` for constants (`const val`)
- The name a native module exposes to JS is part of its public contract — keep it in one `const val NAME` and never rename it casually

## Null Safety

- Never use `!!` — prefer `?.`, `?:`, `requireNotNull()` or `checkNotNull()`
- Values arriving from JS (`ReadableMap`, optional arguments) are untrusted: check presence and type before use
- `currentActivity` can be `null` at any time; handle it instead of asserting

```kotlin
// BAD
val threshold = options!!.getDouble("thresholdDb")

// GOOD
val threshold =
  if (options?.hasKey("thresholdDb") == true) options.getDouble("thresholdDb")
  else DEFAULT_THRESHOLD_DB
```

## Sealed Types

Model closed sets of states with sealed interfaces and exhaustive `when` (no `else` branch):

```kotlin
sealed interface DetectorState {
  data object Idle : DetectorState
  data object Listening : DetectorState
  data class Failed(val reason: String) : DetectorState
}
```

## Scope Functions

- `let` — null check + transform
- `apply` — configure an object
- `also` — side effects
- Avoid nesting scope functions more than 2 levels

## Error Handling

- Never let an exception escape a method called from JS — reject the promise with a stable error code and a readable message instead.
- Never catch `CancellationException`; rethrow it.
- Do not use `try`/`catch` for ordinary control flow.

```kotlin
// BAD — crashes the app from a JS call
val recorder = AudioRecord(source, rate, channel, format, bufferSize)

// GOOD
try {
  startRecording()
  promise.resolve(null)
} catch (e: SecurityException) {
  promise.reject("E_PERMISSION", "Microphone permission was not granted", e)
}
```
