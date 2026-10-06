---
paths:
  - '**/*.ts'
  - '**/*.tsx'
---

# React Native Hooks

> This file extends [common/hooks.md](../common/hooks.md), which documents the hooks configured in `.claude/settings.json`.

## Edit Time (automatic)

Every Edit or Write of a `.ts` / `.tsx` file runs `eslint --fix --max-warnings=0` and `prettier --write` on that file. In practice this means:

- Import order is fixed for you; an unresolvable import (a typo in an alias, a file that does not exist yet) blocks until it resolves. Create the imported module before the file that imports it.
- The file is reformatted to the repo Prettier config (`singleQuote`, `trailingComma: 'all'`, `arrowParens: 'avoid'`).

## End of Turn (automatic)

`tsc --noEmit` runs when TypeScript files changed. Typed navigation params, theme token names and `Typography` variants are all checked here — a misspelled route or color key fails the turn.

## Manual

| When                                  | Command                          |
| ------------------------------------- | -------------------------------- |
| After changing behaviour              | `npm test -- <pattern>`          |
| Before committing                     | `npm run test:ci`                |
| After changing a screen or component  | `npm start` + `npm run android`  |
| After adding or changing a native dep | `npm run android` (full rebuild) |
| Dependency vulnerability check        | `npm audit`                      |

## Notes

- Hooks never run Gradle, Metro or Jest; keep it that way so edits stay fast.
- Release builds (`npm run android:release`, `npm run android:bundle`) are explicit commands only.
