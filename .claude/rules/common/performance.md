# Tooling Performance and Build Troubleshooting

> App runtime performance is covered in [react-native/performance.md](../react-native/performance.md).

## Keep Feedback Loops Short

- Run one test file while iterating (`npm test -- <pattern>`); save `npm run test:ci` for the pre-commit gate.
- `npm run typecheck` checks the whole project in a few seconds — the stop hook runs it for you when TypeScript files changed.
- Do not run Gradle to validate a JS/TS-only change. A native build is only needed when `android/`, a native dependency, or `.env` changes.

## Context Window Management

Start a fresh session, or compact first, before work that needs a lot of context:

- Refactors that span many files
- Features that touch screens, navigation and services together
- Debugging an interaction between JS and native code

Single-file edits, new utilities and documentation updates are fine late in a session.

## When a Build or Bundle Fails

Work through the cheapest fix first and verify after each step:

1. **Read the first error**, not the last — Gradle and Metro both bury the cause above a long tail.
2. **Metro / bundling errors** (unresolved module, stale transform): restart with `npm start -- --reset-cache`. An unresolved alias usually means it is missing from one of `tsconfig.json`, `babel.config.js` or `jest.config.js`.
3. **Babel or `.env` changes not picked up**: `react-native-dotenv` values are inlined at transform time — reset the Metro cache as above.
4. **Android build errors**: confirm JDK 17 and `JAVA_HOME`, then `npm run android:clean` and rebuild with `npm run android`.
5. **After adding or upgrading a native dependency**: rebuild the app; a Metro reload is not enough. Confirm the library supports the New Architecture and React Native 0.86.
6. **Jest failing on a new dependency**: ESM packages must be added to `transformIgnorePatterns` in `jest.config.js`, and native modules need a mock in `jest.setup.js`.
