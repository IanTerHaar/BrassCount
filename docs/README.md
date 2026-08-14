# BrassCount

**Android-first** React Native + TypeScript boilerplate.

[![Build (Android)](https://github.com/IanTerHaar/BrassCount/actions/workflows/build.yml/badge.svg)](https://github.com/IanTerHaar/BrassCount/actions/workflows/build.yml) [![Tests](https://github.com/IanTerHaar/BrassCount/actions/workflows/tests.yml/badge.svg)](https://github.com/IanTerHaar/BrassCount/actions/workflows/tests.yml) [![Lint & Type Check](https://github.com/IanTerHaar/BrassCount/actions/workflows/lint.yml/badge.svg)](https://github.com/IanTerHaar/BrassCount/actions/workflows/lint.yml) [![Security Audit](https://github.com/IanTerHaar/BrassCount/actions/workflows/security-audit.yml/badge.svg)](https://github.com/IanTerHaar/BrassCount/actions/workflows/security-audit.yml)

## Key scripts

- `npm start` — Metro bundler
- `npm run android` — Build & run on Android (debug)
- `npm run android:release` — Build release APK
- `npm test` — Jest

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch naming, commit message conventions, Husky git hooks, linting workflows, and PR guidelines.

## Notes

- Path aliases are mirrored in `babel.config.js`, `tsconfig.json`, and `jest.config.js`.
- For CI/release builds, ensure a JDK is available and `JAVA_HOME` is set.

## License

This repository is released under a proprietary "All rights reserved" license. See LICENSE for details.
