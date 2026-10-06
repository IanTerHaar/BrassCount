---
paths:
  - '**/*.kt'
  - '**/*.kts'
---

# Kotlin Patterns

> This file extends [common/patterns.md](../common/patterns.md) with Kotlin content for the React Native Android host.

## Keep the Native Layer Thin

- The host app is the stock React Native template: `MainActivity` (a `ReactActivity`) and `MainApplication` (builds the `ReactHost`). Leave them as close to the template as possible so React Native upgrades stay mechanical.
- Third-party native libraries are autolinked through `PackageList(this).packages`; only add a package manually in `MainApplication` when autolinking genuinely cannot handle it.
- Prefer an existing, maintained, New-Architecture-compatible library over writing a native module. Write one only for a platform capability with no good library — and agree it with the user first.
- A native module exposes a small, typed surface (start, stop, a few events). Business rules — drill logic, par times, scoring, persistence — stay in TypeScript, where they are tested by Jest.

## Native Modules (New Architecture)

The app runs with `newArchEnabled=true`, so new native code is written as a Turbo Native Module:

- Define the contract first as a TypeScript spec (`Native<Name>.ts`, a `TurboModule` interface) — Codegen generates the Kotlin base class from it.
- Implement the generated spec in Kotlin; do not hand-write the bridge signature.
- Mirror the module in `jest.setup.js` with a mock so the JS side stays testable.
- Wrap the module in a service under `src/services/` and have screens depend on the service, not on the native module directly.

## Threading

- Methods called from JS do not run on the main thread, and must not block. Move long-running or blocking work (audio capture, file I/O) onto a dedicated thread or coroutine scope.
- Anything that touches views or the Activity runs on the main thread.
- Tie background work to the module's lifecycle: start it explicitly, stop it in the module's invalidation callback and when the host is paused or destroyed. Never leave a recorder, thread or scope running after JS has gone away.

## Coroutines

When a module uses coroutines:

- Give the module its own `CoroutineScope(SupervisorJob() + Dispatchers.Default)` and cancel it on invalidation. Never use `GlobalScope`.
- Use `withContext(Dispatchers.IO)` for blocking I/O.
- Never swallow `CancellationException`.

## Results and Events to JS

- One-shot calls return through a `Promise`: `resolve` on success, `reject(code, message, throwable)` on failure, with stable string codes the TypeScript wrapper can map to its error class.
- Streams (for example detected sound events) are emitted as events with small, flat payloads. Include a timestamp taken on the native side — do not rely on when JS receives the event for timing.

## Timing

BrassCount measures intervals, so use a monotonic clock for elapsed time (`SystemClock.elapsedRealtimeNanos()`), never wall-clock time, which can jump.

## References

See skill: `kotlin-coroutines-flows` for coroutine and Flow patterns.
See skill: `kotlin-patterns` for general Kotlin idioms.
