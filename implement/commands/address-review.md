# Address the review

A two-axis review of this branch's diff has come back. Address every finding on both axes, then commit.

- The review: `$ARTIFACTS_DIR/code-review.md`, with Standards and Spec kept as separate sections. Summary: $INPUTS.review_summary
- The contract the work was built against: `$ARTIFACTS_DIR/work/work-spec.md`.
- What the implementer did and why: `$ARTIFACTS_DIR/implementation.md`.

Read `GLOSSARY.md` and the relevant ADRs before you change anything.

## How to judge each finding

- **Spec findings** (missing, partial, wrong) are fixed. A finding is declined only with evidence that it is wrong or already satisfied, quoting the spec line and the code that meets it. Scope creep is removed unless the spec, read again, actually asks for it.
- **Documented-standard violations** are fixed, or declined only with evidence that the cited rule doesn't apply.
- **Judgement calls** (baseline smells) are fixed when the fix is local to the change and leaves the code simpler. Otherwise decline them with a one-line reason. Refactoring is in scope now: this is the review stage `/tdd` defers it to. When a smell is about a module's shape, call the Skill tool with `codebase-design`.

Keep behaviour covered as you change it. Call the Skill tool with `tdd` for any behaviour you add or alter, and test only at the seams the spec agreed. Never widen the change into unrelated cleanup.

Check only what you touched: after your last change, run the type-check and the test files that cover the code you changed. Don't run the full suite or the build. A deterministic gate re-runs the project's full check commands once, on the final tree, after you.

Commit each coherent fix (stage by name, no AI attribution). Leave nothing uncommitted. Do not push or open a pull request.

## Report and declare

Append a `## Review response` section to `$ARTIFACTS_DIR/implementation.md` giving each finding a disposition: **fixed**, or **declined** with its reason.

- `done`: true.
- `green`: true when the type-check and the tests covering what you changed ran after your last change and passed.
- `summary`: what you fixed and what you declined, and the commands you ran.
