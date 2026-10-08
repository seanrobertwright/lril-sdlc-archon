# Survey the architecture for deepening opportunities

Surface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability. This is Matt Pocock's `/improve-codebase-architecture`, steps 1 and 2. It is a survey, not a rescue: find the real candidates and hand them over. Change nothing in the repository.

Direction, if any (the input wins over the message):

$INPUTS.focus

$ARGUMENTS

## Vocabulary

Call the Skill tool with `codebase-design` and use its terms exactly in every suggestion: **module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**. Apply its principles: the deletion test, "the interface is the test surface", and "one adapter means a hypothetical seam, two adapters mean a real one". Don't drift into "component", "service", "API" or "boundary".

Use `GLOSSARY.md` for the domain: if it defines "Order", talk about "the Order intake module", not "the FooBarHandler" or "the Order service". Read the ADRs in `docs/adr/`; they record decisions you should not re-litigate.

## 1. Explore

**Scope before you scan (YAGNI).** Deepening a module pays off by making future changes to it easier, so weight the parts that change.

- If a direction was named above, take it and skip the inference.
- Otherwise walk back a good stretch of `git log --oneline` (and `git log --stat`) to find the hot spots: the files and areas that keep coming up. Let those pull your attention first. If the changes are scattered with no clear hot spot, widen the net.

Then dispatch a subagent to walk the code organically, noting where it experiences friction:

- Where does understanding one concept mean bouncing between many small modules?
- Where are modules **shallow**, with an interface nearly as complex as the implementation?
- Where were pure functions extracted just for testability, while the real bugs hide in how they're called (no **locality**)?
- Where do tightly coupled modules leak across their seams?
- What is untested, or hard to test through its current interface?

Apply the **deletion test** to anything that looks shallow: would deleting it concentrate complexity, or just move it? "Concentrates" is the signal you want. Classify each candidate's dependencies (in-process, local-substitutable, ports & adapters, or mock), because the category decides how the deepened module is tested across its seam.

## 2. The HTML report

Write one self-contained file to `$ARTIFACTS_DIR/architecture-review.html` (outside the repo). It loads **Tailwind via CDN** (`<script src="https://cdn.tailwindcss.com"></script>`) and **Mermaid via CDN** (an ES module import from `cdn.jsdelivr.net/npm/mermaid@11`).

- **Header**: repo name, date, and a compact legend (solid box = module, dashed line = seam, red arrow = leakage, thick dark box = deep module). No introduction paragraph.
- **One `<article>` card per candidate**:
  - **Title** naming the deepening ("Collapse the Order intake pipeline").
  - **Badge row**: recommendation strength, exactly one of `Strong` (emerald), `Worth exploring` (amber), `Speculative` (slate), plus the dependency category.
  - **Files**: a monospaced list.
  - **Before / After diagram**, the centrepiece: two columns side by side. Use Mermaid when relationships are graph-shaped (call graphs, dependencies, sequences such as "before: 6 round trips; after: 1"). Use hand-built divs or inline SVG for the editorial visuals Mermaid renders badly: an "after" that reads as one thick-bordered deep module with greyed-out internals, mass diagrams, cross-sections. Vary the patterns.
  - **Problem**: one sentence on what hurts. **Solution**: one sentence on what changes.
  - **Wins**: short bullets in terms of locality and leverage, and how tests improve ("Tests hit one interface", "Delete 4 shallow wrappers").
  - **ADR callout**, only when a candidate contradicts an ADR *and* the friction is real enough to reopen it: one amber line, "contradicts ADR-0007, but worth reopening because…". Don't list every refactor an ADR forbids.
- **`<section id="top-recommendation">`**: which candidate you'd tackle first, and why.

If a diagram needs a paragraph to be understood, redraw the diagram. Do **not** propose concrete interfaces yet; designing them comes after a candidate is picked.

Also write `$ARTIFACTS_DIR/candidates.json`:

```json
{
  "candidates": [
    {
      "title": "<exactly as in the report>",
      "strength": "Strong | Worth exploring | Speculative",
      "dependency_category": "in-process | local-substitutable | ports & adapters | mock",
      "files": ["..."],
      "problem": "...",
      "solution": "...",
      "wins": ["..."],
      "adr_conflict": ""
    }
  ],
  "top_recommendation": "<title of the candidate to tackle first>"
}
```

A script checks both files after you. Declare `candidates` (the count) and `top` (the top recommendation's title).
