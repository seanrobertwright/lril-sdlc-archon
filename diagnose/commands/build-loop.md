# Diagnose, phase 1: build the feedback loop

A bug has been reported. Your job in this node is **Phase 1 of the `diagnosing-bugs` skill only**: build a tight feedback loop that goes red on *this* bug. Call the Skill tool with `diagnosing-bugs` and follow its Phase 1 exactly. No one is watching; there is no one to ask.

## The bug

$INPUTS.bug

$ARGUMENTS

## Rules for this node

- **Do not theorise and do not fix.** If you catch yourself reading code to build a theory before the command exists, stop. That is the exact failure this phase prevents. The fix comes in the next node, and only after a script has proved your loop red.
- **Redact every secret** in anything you show or save (`<REDACTED>`). Build the loop against environment variables so credentials stay in the environment.
- Spend disproportionate effort here. Try the constructions in the skill's order: a failing test at whatever seam reaches the bug, then an HTTP script, a CLI invocation diffed against a snapshot, a headless browser script, a replayed trace, a throwaway harness, a property or fuzz loop, a bisection harness, a differential loop. Tighten it (faster, a sharper signal, more deterministic).
- **One command.** The loop must be a single shell command, run from the repo root, that exits **non-zero** on the bug and **zero** once it's fixed. A script you wrote counts: keep it in the repo, under a clearly named path, because the fix phase will turn it into the regression test or delete it. You may commit it.
- **Non-deterministic bugs**: raise the reproduction rate inside the command itself (loop the trigger 100×, parallelise, add stress) until it fails reliably. A script will run your command three times and requires all three to go red.
- **Assert the user's exact symptom**, not "it didn't crash". Declare a `symptom`: a literal substring the failing output always contains (an error message, a wrong value). The proof script checks for it on every red run, so pick a string that appears only on this bug. Use `""` only when no stable string exists.
- Run the command yourself at least once and see it go red before you declare it.

## If you cannot build a loop

Say so plainly. Write `$ARTIFACTS_DIR/feedback-loop.md` listing everything you tried, and what would unblock it: (a) access to an environment that reproduces it, (b) a redacted captured artifact (HAR file, log dump, core dump, screen recording with timestamps), or (c) permission to add temporary production instrumentation. Declare `built: false`. The run stops there rather than guess.

## Report and declare

Write `$ARTIFACTS_DIR/feedback-loop.md`: the loop command, how it reaches the bug's code path, a redacted red run, and what you tried before it.

- `built`: true only when the command exists and you have seen it go red on this bug.
- `command`: the exact command.
- `symptom`: the literal substring every red run's output contains, or `""`.
- `summary`: a few sentences on the loop and why it's tight.
