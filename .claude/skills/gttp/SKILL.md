---
name: gttp
description: Get to the Point — a concise summary and explanation of what was just done in this conversation. Call it after an answer or a finished task with /gttp; optionally pass a focus, e.g. "/gttp the storage change".
argument-hint: '[optional focus]'
disable-model-invocation: true
---

# GTTP — Get to the Point

The user has just read (or skipped) a longer answer and wants the short version. Summarise the work that came before this command — by default the most recent task or answer; if the conversation covered several tasks, the latest one unless the focus says otherwise.

Focus requested by the user (may be empty): $ARGUMENTS

## Rules

- Work only from what is already in the conversation. Do not run tools, re-read files, re-run tests or start new work — this is a recap, not a re-check.
- Lead with the outcome in one sentence: what now exists or what the answer is.
- Say only what actually happened. If something failed, was skipped, or was not verified, say so plainly; never upgrade "written" to "working".
- Plain words, full sentences. No preamble, no recap of the request, no closing offer.
- Leave out the process: what was tried, the order of steps, and anything the user does not need in order to act.
- If nothing has been done yet in this conversation, say that in one line and stop.

## Format

Keep the whole reply under roughly 150 words. Drop any section that has nothing in it.

**Result** — one sentence: the outcome.

**What changed** — up to five bullets, one line each. Name the file (`path:line` where useful) and what it now does.

**Why** — one or two sentences explaining the reasoning or the cause, in terms a reader who skipped the original answer can follow.

**Needs you** — only if something is left for the user: a decision, an unverified step, a failing check, a MEDIUM reviewer finding.

For a pure question-and-answer exchange with no code changes, skip the headings and give the answer in two or three sentences.
