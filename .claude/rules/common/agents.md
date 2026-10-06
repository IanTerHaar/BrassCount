# Agents

## Project Agents

Three reviewer agents live in `.claude/agents/`. They are read-only reviewers: they report findings and never rewrite code.

| Agent               | Scope                                                                   | Use for                              |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| typescript-reviewer | Type safety, async correctness, error handling, service conventions     | Any change to `.ts` / `.tsx` / `.js` |
| react-reviewer      | Hooks, rendering, navigation, theming, accessibility in React Native UI | Any change to `.tsx` under `src/`    |
| kotlin-reviewer     | Android host app, native modules, manifest, Gradle                      | Any change under `android/`          |

Invoke them through the Agent tool with the matching `subagent_type`:

```text
Agent(subagent_type: "typescript-reviewer", prompt: "Review the diff on this branch against main")
```

A `.tsx` change gets both `typescript-reviewer` and `react-reviewer`; a pure `.ts` change (services, utils, types) gets only `typescript-reviewer`.

The built-in `Plan` and `Explore` agents cover implementation planning and broad codebase searches. There are no project-specific planner, TDD, security, or build-fix agents — do that work directly, following the rules in this folder.

## Automatic Review After Code Changes

This is a standing instruction from the project owner: run the matching reviewers without being asked. No further prompt from the user is needed.

When a task has changed code, review it **once, after the implementation is finished and before reporting the work as done**:

| Files changed in the task                          | Spawn                                    |
| -------------------------------------------------- | ---------------------------------------- |
| `.ts` / `.js` only (services, utils, types, tests) | `typescript-reviewer`                    |
| Any `.tsx`                                         | `typescript-reviewer` + `react-reviewer` |
| Anything under `android/`                          | `kotlin-reviewer`                        |
| A mix                                              | Every reviewer that matches, in parallel |

How to run it:

1. Finish the change first, and make sure the tests you touched pass — reviewers assume lint, types and tests are green.
2. Spawn the matching reviewers in a single message so they run in parallel. Tell each one which files changed and what the change is meant to do.
3. Wait for every reviewer to return (see the completion contract below).
4. Fix CRITICAL and HIGH findings yourself, then re-run only the reviewer that raised them if the fix was non-trivial. Report MEDIUM findings to the user rather than silently fixing or ignoring them.
5. In the final message, say which reviewers ran and what they found.

Review per task, not per edit: one pass over the finished change, not a reviewer after each file write. The edit and stop hooks (see [hooks.md](./hooks.md)) already cover ESLint, Prettier and `tsc` on every edit.

Skip the automatic review only when the change cannot affect behaviour: documentation and comments, formatting-only edits, files under `.claude/`, or root config files. Also run the reviewers whenever the user asks for a review and before opening a pull request.

## Parallel Execution

Launch independent reviews in a single message so they run in parallel (for example `typescript-reviewer` and `react-reviewer` on the same diff). Do not chain them sequentially.

## Delegation Completion Contract

Applies to every agent at every depth:

1. **Your final message is the deliverable.** Never end a turn with "waiting for background agents" — a spawned task is not a completed task.
2. **If you delegate, you own collection.** Wait for results, integrate them, then return.
3. **Decompose only when the work cannot fit in one context.** Do not re-delegate a task already sized for a single agent.
