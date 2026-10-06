# Security Guidelines

BrassCount is an offline Android app: there is no backend, no authentication and no network API today. The checks below are the ones that apply to that shape; extend this file when a backend or account system is introduced.

## Checks Before Any Commit

- [ ] No hardcoded secrets (API keys, passwords, tokens) in source, `app.json`, Gradle files or tests
- [ ] `.env` is not staged — only `.env.example` is committed, and it holds non-secret placeholders
- [ ] No keystore other than `android/app/debug.keystore` is staged
- [ ] User-entered values (drill names, par times, notes) are validated before being stored or used in calculations
- [ ] Error messages shown in the UI do not expose raw exception text or storage keys
- [ ] New Android permissions are justified and requested at the point of use

## Secret Management

- Everything in the JS bundle and the APK can be extracted. Never ship a real secret in either.
- Build-time configuration goes through `react-native-dotenv` (`import { X } from '@env'`); treat every value it exposes as public.
- Release signing credentials come from local, git-ignored Gradle properties or CI secrets — never from the repo.
- If a secret is committed, rotate it; removing it from history is not enough.

## Local Data

- AsyncStorage is unencrypted. It is fine for sessions, drills and preferences; it is not a place for credentials or tokens.
- All persistence goes through `src/services/storage.ts`. Do not call AsyncStorage directly elsewhere.
- `android:allowBackup` is `false` in the manifest; keep it that way unless the user decides otherwise.

## Dependencies

- `npm audit` runs weekly and on dependency changes to `main` (`.github/workflows/security-audit.yml`).
- Known-vulnerable transitive packages are pinned through `resolutions` / `overrides` in `package.json`; add to those rather than ignoring an advisory.
- New dependencies with native code deserve extra scrutiny: check maintenance, permissions requested, and New Architecture support.

## If a Security Issue Is Found

1. Stop and tell the user what was found and where
2. Fix CRITICAL issues before continuing with other work
3. Rotate any exposed secret
4. Search the codebase for the same pattern elsewhere
