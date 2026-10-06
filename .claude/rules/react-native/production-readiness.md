---
paths:
  - '**/*.ts'
  - '**/*.tsx'
---

# React Native Production Readiness

> A clean codebase is necessary but not sufficient for a release. These items cover the ship-grade concerns that style and pattern rules do not.

## Build & Release

- Release artifacts come from Gradle: `npm run android:release` (APK) and `npm run android:bundle` (AAB for the Play Store).
- CI builds a debug APK (`assembleDebug`, arm64) on every push and PR; there is no automated release or store-submission pipeline yet.
- The `release` build type is still signed with the debug keystore (`android/app/build.gradle`). A store release needs a real signing config whose keystore and passwords are never committed; only `android/app/debug.keystore` belongs in the repo.
- R8 / ProGuard changes go in `android/app/proguard-rules.pro`. Test a release build after adding any library that relies on reflection or serialization.

## Versioning

- The app version is bumped automatically on merge to `main` (`package.json`, `package-lock.json`, `VERSION.txt`, plus a `v*` tag). Never edit these by hand; steer the bump with `#minor` / `#major` in the PR title.
- Android's `versionName` and `versionCode` are derived in `android/app/build.gradle` from the repo-root version file (`versionCode = major*10000 + minor*100 + patch`), so they follow the same bump. Do not hardcode either.

## Configuration

- Build-time configuration comes from `.env` through `react-native-dotenv`. `.env.example` documents every variable and is what CI builds with.
- Validate required configuration at startup and fail with a clear message.
- Nothing in `.env` is secret once it is compiled into the bundle.

## Data Durability

- Stored sessions must survive app updates. A change to a stored shape needs a namespace `version` bump and a migration, tested against data written by the previous version.
- A corrupt stored entry must never crash the app or block loading the rest.

## Observability

- No crash or error reporting is integrated. Until one is, failures must be visible in the UI — never fail silently.
- Do not leave verbose logging in release builds.

## Pre-Release Gate

Before shipping, all must pass:

- [ ] `npm run lint`, `npm run format:check`, `npm run typecheck` clean
- [ ] `npm run test:ci` green
- [ ] `npm audit` reviewed
- [ ] Release build installs and runs on a physical Android device
- [ ] Timer accuracy checked on the release build
- [ ] Upgrade tested over an install of the previous version with existing data
- [ ] Key flows walked with TalkBack and at the largest font size, in light and dark themes
- [ ] No secrets in the bundle (see security.md)
