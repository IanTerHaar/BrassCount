# Hooks

Two layers of automation run in this repo. Both call the same tools as the `package.json` scripts, so a clean hook run means the matching CI job will pass.

## Claude Code Hooks

Configured in `.claude/settings.json`; the scripts live in `.claude/hooks/`.

| Event                       | Script              | What it runs                                                                                                  | `package.json` equivalent |
| --------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| PostToolUse (`Edit\|Write`) | `post-edit.js`      | `eslint --fix --max-warnings=0` then `prettier --write` on the edited file                                    | `npm run lint:format`     |
| Stop                        | `stop-typecheck.js` | `tsc --noEmit` for the whole project, only when the working tree has `.ts` / `.tsx` / `tsconfig.json` changes | `npm run typecheck`       |

Behaviour to expect:

- **The edit hook rewrites files.** After an Edit or Write, the file on disk may differ from what was written (imports reordered, formatting changed). Re-read before making a follow-up edit to a region it may have touched.
- **File coverage matches lint-staged.** `*.{ts,tsx,js,jsx}` get ESLint + Prettier; `*.{json,md,yml,yaml}` get Prettier only. Files under `node_modules/`, `android/`, `ios/` and `coverage/` are skipped, and the root config files ESLint ignores are formatted but not linted.
- **Failures block.** An ESLint error or warning that `--fix` cannot resolve, or a type error at the end of a turn, is fed back as a blocking error. Fix the cause — do not add `eslint-disable` or `@ts-ignore` to get past it.
- **Tests are not run by hooks.** Run `npm test -- <pattern>` yourself after changing behaviour, and `npm run test:ci` before committing.
- **Android builds are never run by hooks.** Gradle is too slow for edit-time automation; build with `npm run android` when native code changes.

When adding a root-level config file that ESLint should ignore, add it to all three lists: `.eslintrc.js` (`ignorePatterns`), `.lintstagedrc.js` and `.claude/hooks/post-edit.js`.

## Git Hooks (husky)

| Hook         | What it runs                                                                             |
| ------------ | ---------------------------------------------------------------------------------------- |
| `pre-commit` | lint-staged — the same ESLint + Prettier pass, on staged files                           |
| `commit-msg` | Conventional-commit check on the subject line (see [git-workflow.md](./git-workflow.md)) |

Never bypass these with `--no-verify`.

## Permissions

- Never use the `--dangerously-skip-permissions` flag.
- Prefer allow-listing specific commands in `.claude/settings.json` (shared) or `.claude/settings.local.json` (personal) over broad auto-accept.
