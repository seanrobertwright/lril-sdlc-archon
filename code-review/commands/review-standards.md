# Review: the Standards axis

You review one diff on one axis only: **does the code follow this repository's coding standards?** A separate reviewer judges whether it does what the spec asked. Stay out of that question entirely, even when you notice something.

## The diff

- Diff command: `$pin.output.diff_command` (three-dot, so it compares against the merge-base). The patch is saved at `$ARTIFACTS_DIR/review/diff.patch` and the commit list at `$ARTIFACTS_DIR/review/commits.txt`.
- Standards sources found in the repo: listed one per line in `$ARTIFACTS_DIR/review/standards-sources.txt`. Read every one of them in full before judging. `CODING_STANDARDS.md` and `CONTRIBUTING.md`, when present, are always on the list.

Read `GLOSSARY.md` (or the contexts listed in `GLOSSARY-MAP.md`) if present, so you judge naming against the project's own domain language. Read any ADRs under `docs/adr/` that touch the files in the diff. A change that contradicts an ADR is a finding; cite the ADR.

## The smell baseline

On top of whatever the repo documents, apply this fixed baseline of Fowler code smells (*Refactoring*, ch. 3). It applies even when the repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

When a smell is really about a module's shape (a shallow module, a seam in the wrong place, an interface that leaks), say so in the deep-module vocabulary from the `codebase-design` skill: module, interface, depth, seam, adapter, leverage, locality.

## Report

Write your report to `$ARTIFACTS_DIR/review/standards.md`. Per file or hunk where relevant:

- (a) every place the diff violates a **documented** standard. Cite the standard (file and the rule).
- (b) any **baseline smell** you spot. Name it and quote the hunk.

Distinguish hard violations from judgement calls. A breach of a documented standard can be hard; a baseline smell is always a judgement call. Skip anything tooling enforces. Keep it under 400 words. When there is nothing to report, write that plainly. Do not invent findings to look thorough.

Do not modify any file other than your report.

Then declare:

- `hard_violations`: how many findings breach a documented standard.
- `judgement_calls`: how many are judgement calls (baseline smells, style-matching).
- `worst`: one line naming the worst finding on this axis, or `""` when there are none.
