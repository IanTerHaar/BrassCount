# Development Workflow

Extends [git-workflow.md](./git-workflow.md) with the steps before git operations.

1. **Reuse first.** Check `src/components`, `src/hooks`, `src/utils` and `src/services` before writing new code. Prefer what is installed; adding a dependency, especially native, is the user's decision. Confirm library behaviour against the installed versions (React Native 0.86, React 19, React Navigation 7), not memory.
2. **Branch** from `main` as `<type>/<kebab-description>`.
3. **Test first**: failing test in `__tests__/`, minimal implementation, refactor. See [testing.md](./testing.md).
4. **Verify.** Hooks lint, format and type-check as you edit ([hooks.md](./hooks.md)). Before committing run `npm run lint && npm run format:check && npm run typecheck && npm run test:ci`. For UI or native changes, run the app and exercise the screen: tests don't cover layout or native behaviour.
5. **Review.** Run the matching reviewer agents automatically and fix CRITICAL and HIGH findings before reporting done ([agents.md](./agents.md)).
6. **Docs.** When a feature changes documented behaviour, update the matching area rule or the code's header comment. Add to `CLAUDE.md` only for a new invariant or gotcha; it has a size budget (`npm run check:memory`) and the Stop hook fails the turn when it is exceeded.
7. **Commit and PR** per [git-workflow.md](./git-workflow.md).
