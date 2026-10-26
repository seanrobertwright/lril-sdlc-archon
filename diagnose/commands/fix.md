# Diagnose, phases 2 to 6: reproduce, hypothesise, instrument, fix, clean up

A script has just run your feedback loop and proved it red on the unfixed code. Its record is at `$ARTIFACTS_DIR/loop/red.md`. Continue the `diagnosing-bugs` skill from **Phase 2** and follow it through Phase 6. Call the Skill tool with `diagnosing-bugs` if its text isn't already in front of you. No one is watching, so decide and record your decisions.

- The loop: `$feedback-loop.output.command`
- The symptom it asserts: `$feedback-loop.output.symptom`

Read `GLOSSARY.md` and the ADRs in the area for a clear mental model of the modules involved.

## Phase 2: reproduce and minimise

Confirm the loop produces the failure mode the *user* described, not a nearby one. Then shrink the repro to the smallest scenario that still goes red, cutting one element at a time and re-running after each cut, until every remaining element is load-bearing.

## Phase 3: hypothesise

Generate **3 to 5 ranked, falsifiable hypotheses** before testing any of them, each in the form "If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse." Write the ranked list to `$ARTIFACTS_DIR/hypotheses.md`. The person who reads this run can re-rank instantly from domain knowledge, so the list must be there even though you don't wait for them.

## Phase 4: instrument

Each probe maps to one prediction; change one variable at a time. Prefer a debugger or REPL, then targeted logs at the boundaries that separate hypotheses. Never log everything and grep. **Tag every debug log** with one unique prefix such as `[DEBUG-a4f2]`. For performance regressions, measure a baseline first, then bisect.

## Phase 5: fix and regression test

Write the regression test **before** the fix, and only at a **correct seam**: one where the test exercises the real bug pattern as it occurs at the call site. Call the Skill tool with `tdd` for what a good test is, and `codebase-design` when seam placement is the question.

1. Turn the minimised repro into a failing test at that seam. Watch it fail. If you forced the red by mutating code or a fixture, diff against a pristine copy to prove the mutation landed.
2. Apply the fix. Watch the test pass.
3. Re-run the original, un-minimised feedback loop.

If no correct seam exists, **that is the finding**: the architecture is preventing the bug from being locked down. Don't write a shallow test that gives false confidence. Document why in `no_seam`.

## Phase 6: clean up

- The original loop no longer reproduces the bug.
- All `[DEBUG-...]` instrumentation is gone (grep for your prefix).
- Throwaway harnesses are deleted, or turned into the regression test.
- Commit the fix with the **hypothesis that turned out correct** in the commit message, so the next debugger learns. Stage files by name; no AI attribution. Leave nothing uncommitted.

A script re-runs the loop, runs your regression test (once, when it is the loop command itself), and greps the diff for `[DEBUG-` after you, so declare only what holds.

## Report and declare

Write `$ARTIFACTS_DIR/diagnosis.md`: the minimised repro, the ranked hypotheses and which one held, the probes that decided it, the fix, and the regression test (or the missing-seam finding).

- `fixed`: true only when the loop is green and the fix is committed.
- `hypothesis`: the hypothesis that turned out correct, in one sentence.
- `regression_test`: the exact command that runs the new regression test, or `""` when no correct seam exists.
- `no_seam`: why no correct seam exists, or `""` when you wrote the regression test.
- `summary`: a few sentences.

Declare only after every other tool call has returned. Declaring ends your session, so a file write or commit still running when you declare is lost.
