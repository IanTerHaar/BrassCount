---
name: typescript-testing
description: Write or update Jest tests for TypeScript / React Native code in this repo, following the project's testing rules. Use whenever a task needs a test written, changed or fixed in `__tests__/` — new or changed behaviour in `src/services`, `src/utils`, `src/hooks`, `src/screens` or `src/components`, a bug fix that needs a failing test first, or a request like "add tests for X" or "cover this". Also use when deciding what tests a change needs. Invoke manually with /typescript-testing, optionally naming the file or behaviour to test.
argument-hint: '[file, function or behaviour to test]'
---

# TypeScript Testing

This skill is a thin workflow over the project's testing rules. It deliberately holds **no testing rules of its own**: the rules live in `.claude/rules/` and the user edits them there. Restating them here would let the two drift apart, so always read them fresh.

Target of the tests (may be empty): $ARGUMENTS

## 1. Read the rules first, every time

Read these before writing anything, even if you think you remember them — they may have changed since you last saw them:

- `.claude/rules/common/testing.md` — always. What requires tests, conventions, TDD steps, structure and naming.
- `.claude/rules/typescript/testing.md` — always. Typing tests, fakes, async assertions.
- `.claude/rules/react-native/testing.md` — when the code under test is a `.tsx` file, a hook, or anything that renders.
- The "Tests" paragraph of `.claude/CLAUDE.md` and `jest.setup.js` if you need to know what is already mocked globally.

## 2. Precedence

The rules win. If anything in this file, or in your own habits, disagrees with a rule file, follow the rule file. If two rule files disagree, the more specific one (`typescript/`, `react-native/`) extends `common/`. If a rule is ambiguous or blocks something the task needs (for example, it says not to add a library), stop and ask the user rather than working around it.

## 3. Workflow

1. Identify what changed or what the user pointed at, and use the rules' "what to test" guidance to pick the kind of test and where it lives.
2. Look at one or two existing tests of the same kind in `__tests__/` and match their style, helpers and imports. The existing suite shows how the rules are applied in practice.
3. Follow the rules' TDD order: write the test, run it, and confirm it fails for the right reason before implementing (when you are also writing the implementation).
4. Run only the relevant file while iterating (`npm test -- <pattern>`), as the rules describe. Run the broader gate only if the rules call for it at that point.
5. Do not weaken, skip or delete an existing test to make something pass; the rules say to fix the implementation unless the test itself is wrong.

## 4. Report

When finished, say which tests were added or changed, which ran and their result, and anything that could not be unit tested — in the form the common testing rules ask for.
