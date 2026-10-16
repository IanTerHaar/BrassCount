# Code Review Standards

## When to Review

- Automatically after finishing a task that changed code: see [agents.md](./agents.md)
- Before opening or merging a pull request into `main`, and when the user asks
- Always when a change touches persistence (`storage.ts`, `sessionStorage.ts`), Android permissions or the manifest, or release build configuration

## Before Requesting Review

The same gates CI runs in `.github/workflows/pr-check.yml` must pass locally: `npm run lint`, `format:check`, `typecheck`, `test:ci`. The branch must be up to date with `main`; CI also runs an Android `assembleDebug`.

## Severity

| Level    | Meaning                                                                       | Action             |
| -------- | ----------------------------------------------------------------------------- | ------------------ |
| CRITICAL | Data loss (corrupting or wiping stored sessions), secret in the bundle, crash | **BLOCK**          |
| HIGH     | Bug or significant quality issue                                              | **WARN**: fix      |
| MEDIUM   | Maintainability, including an unexplained file over 800 lines                 | **INFO**: report   |
| LOW      | Style or minor suggestion                                                     | **NOTE**: optional |

Approve with no CRITICAL or HIGH; block otherwise.

## Review Focus

Style rules live in [coding-style.md](./coding-style.md). Beyond them, look for:

- Effects without cleanup (timers, subscriptions, `AbortController`); state updates after unmount or from a superseded async run; floating promises in handlers
- Storage shape changes without a schema version bump and migration
- `.map()` over large arrays inside a `ScrollView` instead of `FlatList`; `createStyles` or style objects created inline during render; the 50 ms timer tick lifted higher than it needs to be
- Raw colours, spacing or font sizes instead of theme tokens; imports out of order or bypassing aliases
- New logic in `src/services`, `src/utils`, `src/hooks` without tests; hand-edited version numbers; hardcoded secrets
- Reviewer agents and which to run: [agents.md](./agents.md)
