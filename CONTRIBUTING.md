# Contributing to BrassCount

Thank you for taking the time to contribute! This guide explains the workflow, conventions, and automated checks so you can get your changes merged smoothly.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Husky Git Hooks](#husky-git-hooks)
- [Linting and Formatting](#linting-and-formatting)
- [Pull Request Conventions](#pull-request-conventions)
- [CI Checks](#ci-checks)

---

## Getting Started

1. **Fork** the repository and clone your fork locally.
2. Install dependencies:

   ```bash
   npm install
   ```

   > Husky hooks are installed automatically via the `prepare` script.

3. Create a feature branch (see [Branch Naming](#branch-naming) below).
4. Make your changes, commit them, and push to your fork.
5. Open a Pull Request against `main`.

---

## Branch Naming

Use the same conventional-commit keyword as a prefix, followed by a short kebab-case description:

```text
<type>: <short-description>
```

| Type       | When to use                                 |
| ---------- | ------------------------------------------- |
| `feat`     | New feature                                 |
| `fix`      | Bug fix                                     |
| `chore`    | Maintenance, dependency bumps, tooling      |
| `docs`     | Documentation only                          |
| `refactor` | Code restructuring without behaviour change |
| `test`     | Adding or updating tests                    |
| `build`    | Build system or pipeline changes            |
| `ci`       | CI/CD workflow changes                      |
| `perf`     | Performance improvements                    |
| `style`    | Formatting / code style (no logic change)   |
| `revert`   | Reverting a previous commit                 |

**Examples:**

```text
feat: brass-counter-animation
fix: crash-on-empty-state
docs: update-contributing-guide
chore: bump-react-native
```

---

## Commit Messages

Commit messages are validated by the [Husky `commit-msg` hook](#husky-git-hooks) and must follow the **Conventional Commits** format:

```text
<type>[(scope)]: <description>
```

- **type** – one of the keywords in the table above.
- **scope** – optional, lowercase kebab-case identifier in parentheses (e.g. `(auth)`, `(counter)`).
- **description** – short, imperative sentence; no trailing period.

**Valid examples:**

```text
feat: add brass counter animation
fix(counter): resolve crash on empty state
chore: bump react-native to 0.86
docs(readme): update setup instructions
refactor(store): simplify zustand slice
```

**Invalid examples:**

```text
Added new feature          ← no type prefix
feat - add counter         ← wrong separator (use colon + space)
FIX: resolve crash         ← type must be lowercase
```

The hook will print the full list of allowed types and your rejected message so you can correct it immediately.

---

## Husky Git Hooks

[Husky](https://typicode.github.io/husky/) runs two hooks automatically — you don't need to invoke them manually.

### `pre-commit`

Runs **lint-staged** on every staged file before the commit is recorded. Depending on the file extension:

| Files                               | Actions                                         |
| ----------------------------------- | ----------------------------------------------- |
| `*.ts`, `*.tsx`, `*.js`, `*.jsx`    | ESLint (with `--fix`) then Prettier (`--write`) |
| `*.json`, `*.md`, `*.yml`, `*.yaml` | Prettier (`--write`)                            |

If ESLint reports any warnings or errors that cannot be auto-fixed, the commit is **aborted** and the issues are printed to the terminal. Fix them and re-stage before committing again.

### `commit-msg`

Validates that the first line of your commit message matches the Conventional Commits pattern described above. If it doesn't, the commit is **aborted** with a helpful error message showing the allowed formats.

---

## Linting and Formatting

You can run these commands manually at any time:

```bash
# ESLint (zero warnings allowed)
npm run lint

# Auto-fix ESLint issues
npm run lint:fix

# Prettier format check
npm run format:check

# Auto-format all files
npm run format

# Fix lint + format in one shot
npm run lint:format

# TypeScript type check
npm run typecheck
```

The project enforces **zero ESLint warnings** (`--max-warnings=0`). Every rule violation blocks both local commits (via Husky) and CI.

Import ordering is enforced via `eslint-plugin-import` with this group order:

1. `builtin` node modules
2. `external` packages (React and React Native first)
3. `internal` (`@/…` aliases)
4. `parent` / `sibling` / `index`

---

## Pull Request Conventions

### Title format

PR titles must follow the same **Conventional Commits** format as commit messages:

```text
<type>[(scope)]: <description>
```

The `pr-title` CI job uses [`action-semantic-pull-request`](https://github.com/amannn/action-semantic-pull-request) to check this. It runs as a soft check (`continue-on-error: true`), so a non-conforming title won't block the merge, but please follow the convention to keep the changelog clean.

**Examples:**

```text
feat: add brass counter animation
fix(counter): resolve crash on empty state
chore: upgrade dependencies
docs: update contributing guide
```

### PR template

When you open a PR you'll see a template — please fill it in:

- **Summary** – What does this PR change and why?
- **Changes** – Bullet list of the specific modifications.
- **Related Issues** – Link any GitHub issues this PR addresses.
- **Type of Change** – Check the box(es) that apply; the autolabeler workflow uses these to add labels automatically.
- **Checklist** – Confirm the code works and tests are updated.

### Drafts

Mark a PR as **Draft** if it isn't ready for review. The CI jobs that run lint, format, type-check, tests, and PR title validation are all skipped for draft PRs, so you can push works-in-progress without burning CI minutes.

---

## CI Checks

All of the following jobs run automatically on every non-draft PR targeting `main`:

| Job                       | Command                | Description                   |
| ------------------------- | ---------------------- | ----------------------------- |
| **Lint**                  | `npm run lint`         | ESLint with zero warnings     |
| **Format check**          | `npm run format:check` | Prettier formatting           |
| **Type check**            | `npm run typecheck`    | TypeScript (`tsc --noEmit`)   |
| **Tests**                 | `npm run test:ci`      | Jest with coverage            |
| **Conventional PR title** | —                      | Validates the PR title format |

All checks must pass before a PR can be merged. If a check fails, click the **Details** link on GitHub to see the full output.
