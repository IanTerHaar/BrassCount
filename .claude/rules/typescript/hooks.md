---
paths:
  - '**/*.ts'
  - '**/*.tsx'
  - '**/*.js'
  - '**/*.jsx'
---

# TypeScript/JavaScript Hooks

> This file extends [common/hooks.md](../common/hooks.md) with TypeScript/JavaScript specific content.

## PostToolUse (`.claude/hooks/post-edit.js`)

Runs on every Edit or Write, per file:

- **ESLint** — `eslint --fix --max-warnings=0`. The rules that fire in practice are `import/order` (auto-fixed) and `import/no-unresolved` (not fixable — the import must resolve).
- **Prettier** — `prettier --write`.

Root config files (`babel.config.js`, `jest.config.js`, `eslint.config.js`, …) are formatted but not linted, matching `.lintstagedrc.js`.

## Stop (`.claude/hooks/stop-typecheck.js`)

- **TypeScript** — `tsc --noEmit` across the project when `.ts` / `.tsx` / `tsconfig.json` files changed in the working tree. Errors block the end of the turn.

## Not Automated

- **Tests** — run `npm test -- <pattern>` after changing behaviour.
- **`console.log`** — not detected by a hook or by the current ESLint rules; remove debug logging yourself before finishing.
- **Whole-repo lint and format** — `npm run lint` and `npm run format:check` before committing; the edit hook only sees files edited through Claude.
