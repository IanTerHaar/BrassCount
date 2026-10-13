---
name: kotlin-testing
description: Write or update Kotlin JVM unit tests (JUnit 4) for the Android code under `android/` in this repo, following the project's testing rules. Use whenever a task needs a Kotlin test written, changed or fixed — new or changed logic in `android/app/src/main/java/` such as audio level / dB / peak maths, timestamp arithmetic, source-selection or fallback order, state transitions, or error-code mapping — and whenever Kotlin logic is changed and you need to decide what tests it requires or whether it must first be extracted from Android glue to be testable. Invoke manually with /kotlin-testing, optionally naming the file or behaviour to test.
argument-hint: '[Kotlin file, function or behaviour to test]'
---

# Kotlin Testing

This skill is a thin workflow over the project's testing rules. It deliberately holds **no testing rules of its own**: the rules live in `.claude/rules/` and the user edits them there. Restating them here would let the two drift apart, so always read them fresh.

Target of the tests (may be empty): $ARGUMENTS

## 1. Read the rules first, every time

Read these before writing anything, even if you think you remember them — they may have changed since you last saw them:

- `.claude/rules/common/testing.md` — always. What requires tests, TDD steps, structure and naming, and what to say when something cannot be unit tested.
- `.claude/rules/kotlin/testing.md` — always. The requirement, what counts as testable logic, current state of the test setup, how to write and run the tests, and conventions.
- `.claude/rules/kotlin/coding-style.md` and `.claude/rules/kotlin/patterns.md` — when you extract logic out of Android glue so it can be tested, so the extracted code follows the project style.

Also look at the existing tests under `android/app/src/test/java/` before writing a new one, to match how the rules are applied in practice.

## 2. Precedence

The rules win. If anything in this file, or in your own habits, disagrees with a rule file, follow the rule file. If a rule is ambiguous, or the task seems to need something the rules reserve for the user's decision (a mocking framework, another test library, instrumented tests), stop and ask rather than adding it.

## 3. Workflow

1. Identify the Kotlin logic that changed or that the user pointed at, and use the rules' definition of "logic" to decide whether it needs a unit test or only the device check the rules describe.
2. If the logic is tangled up with Android APIs, extract it first as the rules describe, then test the extracted code.
3. Follow the rules' TDD order: write the test, run it and see it fail for the right reason, then implement.
4. Run the tests the way the rules say to, and read the result — a build that compiles is not a passing test.
5. Do not weaken, skip or delete an existing test to make something pass; fix the implementation unless the test itself is wrong.
6. If the change alters a native module's contract (events, codes, signatures), the rules also call for Jest tests on the JS wrapper — use the `typescript-testing` skill for that part.
7. If the rules say to keep a record of what is covered (for example a "Current State" table) and your change affects it, update it.

## 4. Report

When finished, say which tests were added or changed, which ran and their result, and what could not be unit tested together with the manual device checks that stand in for it — in the form the testing rules ask for.
