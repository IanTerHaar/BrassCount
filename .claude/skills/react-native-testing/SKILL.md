---
name: react-native-testing
description: Write or update Jest component, screen and hook tests for the React Native UI in this repo, following the project's testing rules. Use whenever a task needs a test written, changed or fixed for anything that renders or runs inside React — `.tsx` files under `src/screens` or `src/components`, hooks in `src/hooks`, navigation-dependent screens, anything using timers, gestures, safe-area insets or native-module mocks — including a bug fix in the UI that needs a failing test first. Invoke manually with /react-native-testing, optionally naming the screen, component or hook to test.
argument-hint: '[screen, component or hook to test]'
---

# React Native Testing

This skill is a thin workflow over the project's testing rules. It deliberately holds **no testing rules of its own**: the rules live in `.claude/rules/` and the user edits them there. Restating them here would let the two drift apart, so always read them fresh.

Target of the tests (may be empty): $ARGUMENTS

## 1. Read the rules first, every time

Read these before writing anything, even if you think you remember them — they may have changed since you last saw them:

- `.claude/rules/common/testing.md` — always. What requires tests, TDD steps, what to test per layer, structure and naming, and what to say when something cannot be unit tested.
- `.claude/rules/react-native/testing.md` — always. Tooling, how component tests are set up and queried, mocking, timers.
- `.claude/rules/typescript/testing.md` — always. Typing tests and fakes, async assertions.
- The "Tests" paragraph of `.claude/CLAUDE.md` and `jest.setup.js` — to see what is already mocked globally before adding any mock.

Then read one or two existing tests of the same kind in `__tests__/` (a screen, a component, a hook) and match how the rules are applied there. The existing suite is the best guide to the helpers and wrappers this project already has.

## 2. Precedence

The rules win. If anything in this file, or in your own habits, disagrees with a rule file, follow the rule file. If a rule is ambiguous, or the task seems to need something the rules reserve for the user's decision (a new test library, an end-to-end framework, a new dependency), stop and ask rather than adding it.

## 3. Workflow

1. Identify the screen, component or hook that changed or that the user pointed at, and use the rules' "what to test" guidance to decide what behaviour needs covering.
2. Use the existing tests and the rules to decide how to render it (wrappers, providers, mocks for navigation or services) rather than inventing a setup.
3. Follow the rules' TDD order: write the test, run it and see it fail for the right reason, then implement.
4. Run only the relevant file while iterating (`npm test -- <pattern>`), as the rules describe.
5. Do not weaken, skip or delete an existing test to make something pass; fix the implementation unless the test itself is wrong.
6. If a change touches a native module's contract, the rules also call for Kotlin tests — use the `kotlin-testing` skill for that part. Pure logic with no UI belongs under `typescript-testing`.

## 4. Report

When finished, say which tests were added or changed, which ran and their result, and what could not be unit tested (layout, gestures on a real device, native behaviour) together with the manual checks that stand in for it — in the form the testing rules ask for.
