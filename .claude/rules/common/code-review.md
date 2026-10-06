# Code Review Standards

## When to Review

- Automatically after finishing a task that changed TypeScript, React Native or Android code — see [agents.md](./agents.md)
- Before opening or merging a pull request into `main`
- When the user asks for a review
- When a change touches persistence (`src/services/storage.ts`, `sessionStorage.ts`), Android permissions or the manifest, or the release build configuration

## Before Requesting Review

All of these must pass locally — they are the same gates CI runs in `.github/workflows/pr-check.yml`:

```bash
npm run lint           # ESLint, --max-warnings=0
npm run format:check   # Prettier
npm run typecheck      # tsc --noEmit
npm run test:ci        # Jest with coverage
```

The branch must also be up to date with `main` and free of merge conflicts. CI additionally runs an Android `assembleDebug` build.

## Review Checklist

- [ ] Code is readable and well-named
- [ ] Functions are focused (<50 lines); components that grow past ~200 lines have subcomponents or hooks extracted
- [ ] Source files stay under the 800-line soft ceiling (or the exception is explained)
- [ ] No deep nesting (>4 levels)
- [ ] Errors are handled explicitly; services throw their named error class (`StorageError`, …)
- [ ] No `console.log` or debug statements
- [ ] Design tokens come from `useTheme()` / `useThemedStyles()` — no raw colors, spacing or font sizes
- [ ] Imports follow the enforced order and use the path aliases
- [ ] New logic in `src/services`, `src/utils` and `src/hooks` has tests in `__tests__/`
- [ ] No hand-edited version numbers (`package.json`, `VERSION.txt`)
- [ ] No hardcoded secrets or credentials

## Severity Levels

| Level    | Meaning                                                                          | Action                             |
| -------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| CRITICAL | Data loss (corrupting or wiping stored sessions), secret in the bundle, crash    | **BLOCK** - Must fix before merge  |
| HIGH     | Bug or significant quality issue                                                 | **WARN** - Should fix before merge |
| MEDIUM   | Maintainability concern, including an unexplained file over the 800-line ceiling | **INFO** - Consider fixing         |
| LOW      | Style or minor suggestion                                                        | **NOTE** - Optional                |

## Reviewer Agents

| Agent                   | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| **typescript-reviewer** | Type safety, async correctness, service conventions |
| **react-reviewer**      | React Native components, hooks, navigation, theming |
| **kotlin-reviewer**     | Android host app, native modules, manifest, Gradle  |

See [agents.md](./agents.md) for when each applies.

## Review Workflow

```
1. git diff main...HEAD to understand the change
2. Run lint, format:check, typecheck and test:ci
3. Walk the checklist above
4. Run the matching reviewer agent(s) for a detailed pass
```

## Common Issues to Catch

### Correctness

- Effects without cleanup (timers, intervals, subscriptions, `AbortController`)
- State updates after unmount or from a superseded async run
- Floating promises in event handlers
- Mutating state or stored objects instead of returning new ones
- Storage shape changes without a namespace `version` bump and migration

### Quality

- Large functions (>50 lines) — split
- Deep nesting (>4 levels) — use early returns
- Missing error handling — handle explicitly
- Magic numbers — use named constants or theme tokens
- Missing tests for new logic

### Performance

- Large arrays rendered with `.map()` inside a `ScrollView` instead of `FlatList`
- Style objects or `createStyles` factories created inline during render
- High-frequency state (the 50 ms timer tick) lifted higher than it needs to be

## Approval Criteria

- **Approve**: No CRITICAL or HIGH issues
- **Warning**: MEDIUM issues only (merge with caution)
- **Block**: CRITICAL or HIGH issues found

## Related Rules

- [testing.md](testing.md) - Test requirements
- [security.md](security.md) - Security checklist
- [git-workflow.md](git-workflow.md) - Commit and PR standards
- [agents.md](agents.md) - Reviewer agents
