# Implement

Implement the work described below, test-first, and commit it to the current branch. You run inside a loop: each turn continues the same session until you declare the work done. No one is watching this run. There is no human to ask, so decide, and record each decision in your report.

## The work

$fetch.output.title ($fetch.output.ref)

The ticket is at `$ARTIFACTS_DIR/work/ticket.md`. When it has a parent spec, that is at `$ARTIFACTS_DIR/work/spec.md`. Read both in full before you edit anything. The ticket is the contract you are measured against: its acceptance criteria define done. The spec gives the why, the agreed seams, and what is out of scope.

The operator's own words for this run, which win where they conflict with the ticket on task, constraints or scope:

$ARGUMENTS

## Ground yourself

- Read `GLOSSARY.md` (or the contexts listed in `GLOSSARY-MAP.md`) when it exists. Name everything in its vocabulary, and don't drift to the synonyms it lists under _Avoid_.
- Read the ADRs in `docs/adr/` that touch the area you're changing. If your change must contradict one, say so explicitly in your report rather than silently overriding it.
- Read the code the ticket touches, its callers and its tests. Prose is a claim; the code is the fact. When they disagree, follow the code and record the deviation.
- Make the project runnable first: install dependencies with its own package manager in locked mode. Never update a lockfile.

## Build it with /tdd, at the agreed seams

Call the Skill tool with `tdd` and follow it on every cycle. The rules that matter most here:

- **Test only at pre-agreed seams.** The seams were agreed when the spec was written: look for them under the spec's *Testing Decisions* and the ticket's acceptance criteria. No one is here to confirm a new seam, so when the spec names none, use the highest existing seam that reaches the behaviour, and list it in your report as an **unconfirmed seam** so review can judge it. Never test against internals.
- **Vertical slices.** One test, then the minimal code that passes it, then repeat. Never write all the tests first.
- **Red before green.** Watch each new test fail for the right reason before you make it pass.
- **Refactoring is not part of this loop.** It belongs to the review stage that follows.
- Good tests verify behaviour through the public interface, use expected values from an independent source of truth, and survive refactors. Mock only at system boundaries.

When the shape of an interface is itself the question, call the Skill tool with `codebase-design` for the deep-module vocabulary.

Run the type-check and the single test file you're working on regularly. Run the full test suite once at the end.

## Commit

Commit as you go, one commit per coherent outcome. Stage files by name, never `git add -A`. Write messages the way a human explains an outcome, with no AI attribution. When you finish, nothing may be left uncommitted: a later gate refuses a dirty tree.

Do not push, open a pull request, or edit the tracker. Later nodes do that.

## If you cannot do the work

If the ticket is impossible or too ambiguous to build responsibly (it names behaviour that contradicts the code, a prerequisite is missing, or two criteria conflict), say so plainly and stop with `done: true, green: false`, the blocker in `summary`. A clear refusal is a good outcome; code built on a broken premise is not.

## Report and declare (every turn)

Keep `$ARTIFACTS_DIR/implementation.md` current: what changed and why, the seams you tested at (marking any unconfirmed), deviations from the ticket, the check commands you ran and their outcomes, and the commits you made.

- `done`: true when another turn would not help, because the work is complete and green or you are definitively blocked.
- `green`: true only when every acceptance criterion is met and the project's type-check, lint and full test suite ran this turn and passed.
- `summary`: a few sentences on what you did, what stands, and what blocks, if anything.
- `check_commands`: the exact commands you ran for type-check, lint and tests, through the project's own scripts (for example `npm run typecheck`, `pnpm test`). A deterministic gate re-runs every one of them after you, so list only commands that pass on your final tree. Never invent a command the project doesn't define.
