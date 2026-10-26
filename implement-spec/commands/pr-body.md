# Write the pull request

Write the pull request body for this integration branch, which implements a whole spec. Call the Skill tool with `pr` and follow its template exactly: **Summary** (the smallest visual that makes the change clear), **Evidence** (before/after), and **Merge Danger** (one-way or two-way door, plus blast radius). Use the domain language in `GLOSSARY.md`.

Sources, all already on disk:

- The contract: the spec at `$load.output.spec_path` and the tickets in `$ARTIFACTS_DIR/state/graph.json`
- What changed and why: `$ARTIFACTS_DIR/implementation.md`, and the diff: `git diff <base>...HEAD`, where `<base>` is `$sync.output.diff_base`, the change against the base it now merges into
- The two-axis review and the response to it: `$ARTIFACTS_DIR/code-review.md`
- The project checks, re-run by the verify gate on the final tree, as execution evidence: `$ARTIFACTS_DIR/checks/verify.md`

For **Evidence**, prefer execution-based evidence you can quote from those check records: name the test that now passes, in pseudocode. Never claim a before/after you did not observe.

If the record has a "Files the checks changed" section, the check commands rewrote tracked files that were then stashed, not committed: say so under **Merge Danger**, naming the files.

A check record headed "passed when run again (flaky)" means that command failed once and passed on its second run. Say so under **Evidence**: name the command and the tests that failed in its first run, so a reviewer can tell a known flake from one this change introduced.

Write the body to `$ARTIFACTS_DIR/pr/body.md`. Don't add "Closes" lines; the publishing step adds them for the tracked tickets. Don't push or call `gh`; the next node publishes and reads the result back.

Declare `title`: a short, human title for the change, written in the glossary's terms.

Declare only after every other tool call has returned. Declaring ends your session, so a file write or commit still running when you declare is lost.
