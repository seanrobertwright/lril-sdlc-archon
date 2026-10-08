# Write the pull request

Write the pull request body for this integration branch, which implements a whole spec. Call the Skill tool with `pr` and follow its template exactly: **Summary** (the smallest visual that makes the change clear), **Evidence** (before/after), and **Merge Danger** (one-way or two-way door, plus blast radius). Use the domain language in `GLOSSARY.md`.

Sources, all already on disk:

- The contract: the spec at `$load.output.spec_path` and the tickets in `$ARTIFACTS_DIR/state/graph.json`
- What changed and why: `$ARTIFACTS_DIR/implementation.md`, and the diff: `git diff $load.output.start_sha...HEAD`
- The two-axis review and the response to it: `$ARTIFACTS_DIR/code-review.md`
- Check runs re-executed by the gate, as execution evidence: `$ARTIFACTS_DIR/checks/`

For **Evidence**, prefer execution-based evidence you can quote from those check records: name the test that now passes, in pseudocode. Never claim a before/after you did not observe.

Write the body to `$ARTIFACTS_DIR/pr/body.md`. Don't add "Closes" lines; the publishing step adds them for the tracked tickets. Don't push or call `gh`; the next node publishes and reads the result back.

Declare `title`: a short, human title for the change, written in the glossary's terms.
