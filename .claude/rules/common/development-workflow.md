# Development Workflow

> This file extends [git-workflow.md](./git-workflow.md) with the steps that happen before git operations.

## Feature Implementation Workflow

1. **Understand and reuse**
   - Read `.claude/CLAUDE.md` for the architecture, then check `src/components`, `src/hooks`, `src/utils` and `src/services` for something that already does the job before writing new code.
   - Prefer what is already installed (React Navigation, AsyncStorage, gesture-handler, safe-area-context). Adding a dependency — especially one with native code — is a decision for the user, not a default.
   - Confirm library behaviour against the installed version's docs (React Native 0.86, React 19, React Navigation 7) rather than from memory.

2. **Branch**
   - Branch from `main` as `<type>/<kebab-description>`, e.g. `feat/shot-detection`. CI only triggers on these prefixes (see [git-workflow.md](./git-workflow.md)).

3. **Test first**
   - Write the failing test in `__tests__/` (RED), implement the minimum to pass (GREEN), then refactor.
   - Run a single file with `npm test -- <pattern>`.
   - See [testing.md](./testing.md).

4. **Verify**
   - The edit hook lints and formats each file as it is written, and the stop hook type-checks (see [hooks.md](./hooks.md)).
   - Before committing, run the full gate: `npm run lint && npm run format:check && npm run typecheck && npm run test:ci`.
   - For UI or native changes, run the app (`npm start`, `npm run android`) and exercise the affected screen — tests do not cover layout or native behaviour.

5. **Review**
   - Once the implementation is finished, run the matching reviewer agents automatically (see [agents.md](./agents.md)) and fix CRITICAL and HIGH findings before reporting the work as done.

6. **Commit and open the PR**
   - Follow the commit, PR-title and version-tag conventions in [git-workflow.md](./git-workflow.md).
