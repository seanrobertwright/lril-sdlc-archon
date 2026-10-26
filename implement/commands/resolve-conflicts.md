# Resolve the merge with the base branch

Before its pull request is written, this branch was brought up to date with `$sync.output.diff_base`, and the merge stopped on conflicts. The merge is still in progress. Resolve it and commit it. No one is watching this run, so decide, and record each decision in your report.

- The conflicted files: $sync.output.files (`git diff --name-only --diff-filter=U` lists them too)
- The contract the work was built against: `$ARTIFACTS_DIR/work/work-spec.md`.
- What this branch changed and why: `$ARTIFACTS_DIR/implementation.md`.
- What the base changed meanwhile: `git log --oneline HEAD..MERGE_HEAD`, and for one file `git diff HEAD...MERGE_HEAD -- <file>`.
- The project's check commands: `$ARTIFACTS_DIR/checks/commands.json`.

Read `GLOSSARY.md` and the relevant ADRs before you change anything.

## How to resolve

- **Keep both sides' intent.** The base's changes are already merged; this branch's changes are what the pull request proposes. Where both edited the same lines, read the surrounding code and combine them so each still does what it was for. Never pick a side for a file you have not read: no `git checkout --ours` or `--theirs` on a whole file, no `-X ours` or `-X theirs`.
- **Lists both sides appended to** (changelogs, progress records, glossaries, tables, registries): keep every entry from both sides, in the file's own order.
- **Generated files** (a lockfile, a build export, a generated schema or client): don't merge them by hand. Take either side, run the project's own generator, and stage what it writes. Never update a lockfile beyond what the merge needs.
- When you are done, no conflict marker is left: `git diff --check` is clean and a search for `<<<<<<<` finds nothing.

Then run the type-check and the test files that cover the conflicted files, and fix what the merge broke, within the scope of the original change. Don't run the full suite or the build: a deterministic gate re-runs every command in `checks/commands.json` once, after you. Commit the merge with `git commit --no-edit`, and any fix after it as its own commit (stage by name, no AI attribution). Leave nothing uncommitted. Do not push or open a pull request.

If the conflicts can't be resolved responsibly, for example because the base removed or redesigned what this branch builds on, run `git merge --abort` and declare `green: false` with the reason. The run then stops before it publishes.

## Report and declare

Append a `## Merge with the base branch` section to `$ARTIFACTS_DIR/implementation.md`: each conflicted file, and how you resolved it.

- `done`: true.
- `green`: true only when the merge is committed, and the type-check and the tests covering the conflicted files ran after your last change and passed.
- `summary`: what conflicted, how you resolved it, and the commands you ran.

Declare only after every other tool call has returned. Declaring ends your session, so a file write or commit still running when you declare is lost.
