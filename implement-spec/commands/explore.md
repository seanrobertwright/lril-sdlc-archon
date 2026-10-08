# Explore for the implementers

You are the exploration pass of a spec build. Implementers will each build one ticket in a fresh context, and every token they spend finding their way around is a token not spent building. Your job is to make their exploration cheap. You change nothing in the repository.

## Read

- The spec: `$load.output.spec_path`.
- The ticket graph: `$ARTIFACTS_DIR/state/graph.json`. Each ticket's full text is on the tracker (`$load.output.tracker`): for GitHub, `gh issue view <number> --comments`; locally, the file at the ticket's `ref`.
- `GLOSSARY.md` (or the contexts in `GLOSSARY-MAP.md`) and the ADRs under `docs/adr/`.
- `CLAUDE.md`/`AGENTS.md`, and how the project runs its type-check, lint and tests (package scripts, task runners, CI config).

Then walk the code the tickets will touch: the modules, their interfaces, the existing seams the spec's *Testing Decisions* name, and prior-art tests to copy the shape of. When a ticket needs an external API or library fact, read its primary source (official docs, source code) and cite it.

## Write

Write markdown notes under `$ARTIFACTS_DIR/notes/`, outside the repo:

- `overview.md`: the project's check commands (exact invocations), the module map the spec touches, glossary terms in play, ADRs that constrain the work.
- One `ticket-<key>.md` per ticket (key with any `#` removed): the files and interfaces it will touch, the seam to test at and a prior-art test to copy, and the pitfalls you found.

Keep them as context pointers: paths, symbols, commands, and the facts behind them. Don't write implementation plans or code; the implementers decide how. Don't duplicate what the spec or tickets already say.
