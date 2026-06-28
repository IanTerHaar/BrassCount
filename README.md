# BrassCount

**Android-first** React Native + TypeScript boilerplate.

[![Build (Android)](https://github.com/IanTerHaar/BrassCount/actions/workflows/build.yml/badge.svg)](https://github.com/IanTerHaar/BrassCount/actions/workflows/build.yml) [![Tests](https://github.com/IanTerHaar/BrassCount/actions/workflows/tests.yml/badge.svg)](https://github.com/IanTerHaar/BrassCount/actions/workflows/tests.yml) [![Lint & Type Check](https://github.com/IanTerHaar/BrassCount/actions/workflows/lint.yml/badge.svg)](https://github.com/IanTerHaar/BrassCount/actions/workflows/lint.yml) [![Security Audit](https://github.com/IanTerHaar/BrassCount/actions/workflows/security-audit.yml/badge.svg)](https://github.com/IanTerHaar/BrassCount/actions/workflows/security-audit.yml)

## Quick start

```bash
npm install
cp .env.example .env
npm start        # start Metro bundler
npm run android  # build & run on Android (debug)
```

## Prerequisites

- Node >= 22.11.0
- JDK 17 (Temurin recommended)
- Android Studio or a USB-debugging device

## Key scripts

- npm start — Metro bundler
- npm run android — Build & run on Android (debug)
- npm run android:release — Build release APK
- npm run lint — ESLint (fails on warnings)
- npm test — Jest

## Linting & Husky

- Run full lint: `npm run lint` (note: fails on any warning).
- Auto-fix problems: `npm run lint:fix` and `npm run format` (Prettier).
- Pre-commit: Husky + lint-staged runs on `git commit` and auto-fixes staged files.
  - To run those checks manually: `npx lint-staged`.
  - To bypass hooks: `git commit --no-verify` (not recommended).
- Commit message format: conventional commits `keyword(scope)?: message`.
  Valid keywords: feat, fix, chore, docs, refactor, test, build, ci, perf, style, revert.

**Tip:** Running `npm run lint:fix && npm run format` before committing prevents most pre-commit failures.

## Notes

- Path aliases are mirrored in `babel.config.js`, `tsconfig.json`, and `jest.config.js`.
- For CI/release builds, ensure a JDK is available and `JAVA_HOME` is set.

## License

This repository is released under a proprietary "All rights reserved" license. See LICENSE for details.
