# Git Workflow

## Branches

`<type>/<kebab-description>`, branched from `main` — e.g. `feat/start-sequence-service`, `fix/timer-reset`.

The Tests and Android build workflows only run on pushes to `main` and to branches matching `feat*/*`, `fix*/*`, `chore*/*`, `refactor*/*`, `build*/*`, `test*/*`, `ci*/*`. A branch named any other way gets no push CI.

Never commit directly to `main`.

## Commit Message Format

```
<type>(optional-scope): <description>

<optional body>
```

- Types: `feat`, `fix`, `add`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`
- Scope: lowercase letters, digits and hyphens, e.g. `feat(timer): …`
- Description: short, imperative, no trailing period

The husky `commit-msg` hook rejects anything else. The `pre-commit` hook runs lint-staged (`eslint --fix --max-warnings=0` and `prettier --write`) on staged files; if it fails, fix the issue and commit again — never bypass hooks with `--no-verify`.

## Versioning

Never hand-edit `package.json`'s `version`, `package-lock.json`'s version, or `VERSION.txt`. On merge to `main` a bot bumps all three and creates a `v*` tag.

The bump is a **patch** unless the PR title contains `#minor` or `#major`:

```
feat(timer): add randomised start beep #minor
```

## Pull Request Workflow

1. Review the full branch history, not just the latest commit: `git log main..HEAD` and `git diff main...HEAD`
2. Title the PR in the same conventional format as commits, adding `#minor` / `#major` when the change warrants it
3. Fill in `.github/pull_request_template.md` — the autolabeler reads the "Type of Change" checkboxes
4. Push with `-u` if the branch is new
5. Open as a draft while work is in progress: lint, format, type-check and test jobs skip drafts (the Android build still runs)

> For the steps before git operations (tests, verification, review), see [development-workflow.md](./development-workflow.md).
