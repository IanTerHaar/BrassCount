# BrassCount e2e test plan

Work through every area in order; the later ones depend on drills and runs made in the earlier ones. Each numbered check is one line in the report: **PASS**, **FAIL** (a bug: what you did, what you expected, what happened, evidence), **BLOCKED** (could not be exercised, and why), or **N/A** (does not apply to this build, and why).

What the app is supposed to do is in `.claude/CLAUDE.md`. When a check below and CLAUDE.md disagree, CLAUDE.md wins: the app changed after this plan was written. Say so in the report so the plan can be updated.

`d` below is `node .claude/skills/brasscount-e2e/scripts/device.mjs`. Drill names start with `ZZE2E` and are single words (`ZZE2EAlpha`), so the cleanup finds them and the keyboard does not autocorrect them.

## Contents

1. Launch and navigation
2. Drills: create, edit, reorder, limits
3. Drills: delete by swipe
4. Calibration
5. Timer: refusals and permissions
6. Timer: timed runs (synthetic input)
7. Saving and discarding runs
8. History list and detail
9. Profile and appearance
10. Display settings: dark mode and large text
11. Lifecycle: leaving mid-run, relaunch

---

## 1. Launch and navigation

1.1 Cold launch lands on the Timer tab (`screen-timer`), with no red box, no LogBox toast and nothing in `d crashes`.
1.2 Each tab opens its screen: `tab-Calibration` → `screen-calibration`, `tab-Drills` → `screen-drills`, `tab-Timer` → `screen-timer`, `tab-History` → `screen-history`, `tab-Profile` → `screen-profile`. The tab bar stays visible.
1.3 Screenshot each tab once (light theme) and look at it: nothing clipped, overlapping, or unthemed.

## 2. Drills: create, edit, reorder, limits

2.1 Drills → `btn-create-drill` opens `screen-drill-editor` with an empty name, `state-steps-empty`, and the save button disabled; `text-save-hint` names what is missing (name, steps).
2.2 Type a name only (`ZZE2EAlpha`): save is still disabled and the hint now names only the missing steps.
2.3 `btn-add-step` twice: step 1 is a Draw, step 2 a Shot, both untimed; `text-preview` shows the sequence.
2.4 Par picker: `btn-par-step-1` opens the sheet (`text-par-heading`). A preset (`opt-par-*`) sets the par. A custom value (`input-par-custom` → `btn-par-custom-set`) of `1.5` shows as 1.50 s. An invalid one (`abc`, `0`, `61`) is refused with `text-par-custom-hint` and does not change the par. Escape (`d key 111`) closes the sheet without a change.
2.5 Step type: `select-step-2` offers draw, shot, reload, rack, holster (not transition); choosing Reload changes the row and the preview.
2.6 Remove: `btn-remove-step-N` removes that row only; the others keep their type and par.
2.7 Reorder: with two or more steps the Steps header shows Reorder. In reorder mode each row has Move up / Move down (`btn-move-up-step-N`, `btn-move-down-step-N`), disabled at the ends, and par / remove are hidden. A move keeps the step's type and par. Done leaves the mode. With one step there is no Reorder.
2.8 Save (`btn-save-drill`): back on the list, the drill's row shows its name and steps, and `text-drill-count` went up by one.
2.9 Edit: tap the row → the editor loads the same name, steps and pars. Rename (`clear-field`, type `ZZE2EBravo`), change a par, Save changes: the list shows the new name. Reopen: the change stuck.
2.10 Leaving the editor with the back control (`btn-back`) after an edit drops the edit without asking; the stored drill is unchanged.
2.11 Step limit: optional, slow (100 steps). Do it only if the editor's step code changed on this branch; otherwise N/A.

## 3. Drills: delete by swipe

3.1 `d swipe-left id=row-drill-<id>` reveals a red Delete action; the row stays listed.
3.2 Tapping the open row closes it instead of opening the editor.
3.3 Opening one row closes any other open row.
3.4 Delete → `sheet-delete-drill` names the drill. `sheet-delete-drill-cancel` keeps it. Delete → confirm (`sheet-delete-drill-confirm`) removes the row and lowers `text-drill-count`.
3.5 Leaving the tab with a row open closes it.

Make a throwaway `ZZE2EDelete` drill for this area rather than deleting the one used later.

## 4. Calibration

Calibration lives in memory only, so force-stop the app (`d stop-app`, `d launch`) at the start of this area to begin from "Not calibrated".

4.1 Every card (`card-calibration-shot`, `-reload`, `-rack`) reads Not calibrated (`chip-calibration-*`), and its Test button is disabled.
4.2 `d synth silent`, Recalibrate shot: the chip reads Listening, the pressed button reads Cancel, every other Recalibrate / Test button is disabled. About 3 s later it reports no sound heard (`text-feedback-shot`), and the chip is still Not calibrated.
4.3 Cancel: start a Recalibrate and press Cancel straight away; it stops listening and nothing changes.
4.4 `d synth clicks -3 500`, Recalibrate shot, reload and rack in turn: each becomes Calibrated with a threshold of about -9 dBFS (6 dB under the -3 dBFS clicks), and the meter fills to it.
4.5 Test shot with `clicks -3 500`: Test passed, last test about -3 dBFS, tick on the meter.
4.6 `d synth clicks -20 500`, Test shot: Test failed, with the feedback line saying so; the threshold is unchanged.
4.7 Leaving the tab mid-capture cancels it (start a Recalibrate, tap another tab, come back: not Listening).
4.8 Recalibrate all is inert (documented). Note it, do not file it as a bug.

Leave all three sounds calibrated with `clicks -3 500` for the Timer areas, then set `d synth silent`.

## 5. Timer: refusals and permissions

5.1 Picker: `select-drill` lists the stored drills; the timer shows the most recently changed drill until one is picked.
5.2 Uncalibrated refusal: force-stop and relaunch (calibration resets), pick a drill with shot and reload steps, Start: refused before the microphone opens, the header names the uncalibrated sounds, and `btn-go-calibration` is offered and opens the Calibration tab.
5.3 Calibrate one of the named sounds and come back: the refusal now names only the sounds still missing; calibrate the rest and it goes away. (This is the behaviour on the `feat/timer-run-shortcuts` branch; check CLAUDE.md for whether it is in this build.)
5.4 Permission denied: `d mic revoke`, relaunch, calibrate, Start. The system dialog appears; deny it. The run fails with a message, not a crash.
5.5 Permission blocked: deny again (Android blocks after two denials). The header offers `btn-open-settings`; it opens the app's settings page (`d foreground` shows the settings package). Come back with the Back key, then `d mic grant`.
5.6 A drill with only silent steps (draw, holster) cannot be run: Start reports there is nothing to listen for.

## 6. Timer: timed runs (synthetic input)

The UI cannot be dumped while a run ticks. Start with `d tap btn-start` (the button is idle then), then drive by coordinates: find Start/Stop's centre from a dump taken before the run and use `d tap-xy`. Read results once the run has finished and the screen is idle again.

Make `ZZE2ERun`: Draw par 1.00, Shot par 0.25, Shot par 0.30, Shot par 0.30. With the drill's heard steps being three shots, the first shot is due at 1.25 s (the draw's par counts towards it).

How to set the expectation: `run <beepMs> <t1> <t2> <t3>` puts the beep `beepMs` after the request and shots `tN` ms after the beep starts. A step's time is measured from the previous heard step (from zero for the first), and zero is where the beep first reaches half its level, so expect split 1 ≈ t1, split N ≈ tN − tN-1. Tolerance: ±25 ms for split 1 (the beep's onset falls inside a buffer) and ±10 ms for later splits; widen both to ±25 ms if the run caption says it was timed by read time rather than the frame clock. A difference beyond tolerance is a FAIL with the numbers.

6.1 Clean run: `d synth run 150 1200 1500 1850`, Start. Expect splits 1.20 / 0.30 / 0.35, worded `0.05s under` / `0.05s over` / `0.05s over` against pars 1.25 / 0.25 / 0.30, the clock holding at about 1.85, and a caption saying the beep was heard. The run ends on its own after the third shot.
6.2 During the run, `select-drill` is disabled (take the dump right after the run ends if a dump during it fails, and check Start/Stop's label changed while running with a screenshot).
6.3 No beep heard: `d synth run none 1200 1500 1850`. The run times from the request and the caption says the first step may read long.
6.4 Stop early: `d synth run 150 1200`, Start, wait 3 s, Stop (tap-xy). The run finishes with one step heard and the prompt offers Save as incomplete.
6.5 Nothing heard: `d synth silent`, Start, wait 5 s, Stop. `text-nothing-to-save` appears instead of the save prompt.
6.6 Too close together: `d synth run 150 1200 1240 1600 1950` (the second click is 40 ms after the first, under the 70 ms minimum). The 1240 click is not counted: expect splits 1.20 / 0.40 / 0.35.
6.7 Reset (`btn-reset`) returns the timer to idle with empty splits.

## 7. Saving and discarding runs

Note History's Runs counter before this area.

7.1 After a complete run the prompt shows **Save run** and **Discard** (`btn-save-run`, `btn-discard-run`). Save: `text-run-saved` confirms, and Start, Reset and the picker are usable again.
7.2 Save a second run with a different time (`run 150 1150 1450 1800`) and a third slower one (`run 150 1300 1600 1950`), so History has a best, an average and differences to show.
7.3 Discard a run: the prompt goes, nothing is written (History's count is unchanged later).
7.4 Starting a new run, Reset, or picking another drill with an unsaved run drops it without writing.
7.5 Save as incomplete: a run stopped early (6.4) saved as incomplete appears in History detail with Stopped early.
7.6 A run of a drill deleted on the Drills tab while the result is on show is dropped when you come back, with an announcement. (Make and run a `ZZE2EGone` drill, go to Drills, delete it, return.)

## 8. History list and detail

8.1 The list shows one row per drill with runs: `ZZE2ERun` reads `N runs · Best X.XXs · just now`, most recently run first. Runs (`text-history-run-count`) counts every stored session; Drills (`text-history-drill-count`) counts drills with at least one run.
8.2 A drill whose runs were all stopped early shows no best.
8.3 Detail (tap the row): title is the drill's name; Best and Avg (`text-history-detail-best`, `-avg`) count completed runs only; runs are newest first with date and time; each completed run but the first has a `-0.05s vs previous` style chip (`chip-delta-*`), compared with the previous completed run; the fastest completed run has the PB chip (`chip-pb-*`); the stopped run has Stopped early and no delta chip.
8.4 The newest run starts expanded with its Step / Par / Actual / Δ table (`table-splits-*`); the header (`btn-toggle-*`) collapses and expands a card. Values match what the Timer showed.
8.5 Rename `ZZE2ERun` in the editor: History shows the new name (still `ZZE2E…`).
8.6 Delete a drill that has runs (`ZZE2EGone`'s, or make one): its runs stay listed under Deleted drill, and the detail title reads Deleted drill.
8.7 Back (`btn-back`) returns to the list and the tab bar stayed visible throughout.

## 9. Profile and appearance

Write down the profile's name, handle and Appearance setting before touching anything, and put them back at the end of this area.

9.1 The Runs and Drills counters match History's Runs and the Drills tab's count (Profile counts the whole library).
9.2 Edit (`btn-edit-profile`): change the name and handle (`input-profile-name`, `input-profile-handle`; type `e2ehandle` without the @). Save: the handle shows as `@e2ehandle`. Cancel (`btn-cancel-profile`) on a second edit discards it.
9.3 Clearing the name or handle (empty field) and saving clears it.
9.4 Appearance (`row-appearance`) → Light / Dark / System (`opt-appearance-*`) applies at once (screenshot each); `btn-appearance-close` closes the sheet. The choice survives a force-stop and relaunch.
9.5 Restore the original name, handle and appearance, and check them on screen.

## 10. Display settings: dark mode and large text

Read the current values first (`settings get system font_scale`, `cmd uimode night`) and put them back afterwards.

10.1 With Appearance on System, `adb shell cmd uimode night yes`: screenshot Timer, Drills, History detail, Calibration, Profile. Every screen is dark, text readable, no white boxes. Then `night no`.
10.2 Large text: force-stop the app first (changing the font scale while it runs crashes it, a known react-native-screens issue, not a bug to file), `adb shell settings put system font_scale 1.3`, relaunch. The save prompt stacks its two buttons; History detail's summary card puts Avg under Best.
10.3 Same at `2.0`: the History detail run table stacks each step's figures; calibration cards wrap rather than truncate. Screenshot and look.
10.4 Restore the original font scale (force-stop first).

## 11. Lifecycle: leaving mid-run, relaunch

11.1 Start a run (`d synth run 150 1200 5000 9000`), let the first shot land, press Home (`d key 3`), reopen the app: the run has stopped and offers Save as incomplete; capture was interrupted, not left running. Discard it.
11.2 Start a run and switch tabs: the run stops. The finished-run announcement does not show on the other tab.
11.3 Force-stop and relaunch: drills, runs and profile are still there; calibration is back to Not calibrated (it is in memory only by design).

After each area, run `d crashes`. A crash or a JS error in the log is a FAIL for that area even if the screen looked fine.
