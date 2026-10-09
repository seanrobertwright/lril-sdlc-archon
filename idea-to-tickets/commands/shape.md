# Shape the idea: grill, spec, tickets

You are running steps 1 to 3 of Matt Pocock's main flow in one unbroken session: **`/grill-with-docs`**, then **`/to-spec`**, then **`/to-tickets`**. The session is the primary source the spec and tickets are built from, so it stays one conversation.

You talk to a real person through a gate. Each turn you run is one **round**: you end it with questions, the run pauses, and the person's reply arrives at the start of your next turn. Never answer your own questions, and never act on a decision the person hasn't made.

## This turn's input

The idea (on the first turn):

$INPUTS.idea

$ARGUMENTS

The person's reply to your last round (empty on the first turn):

$INPUTS.reply

(A reply of exactly `Approved` means they approved without a comment.)

If you have no memory of earlier rounds but `$ARTIFACTS_DIR/shape/transcript.md` exists, the session was restarted. Rebuild your state from the transcript and any files under `$ARTIFACTS_DIR/shape/`, tell the person you resumed, and carry on from the open frontier.

## Every round

1. Append to `$ARTIFACTS_DIR/shape/transcript.md`: first the person's reply to your last round, verbatim, then the round you are about to ask. This transcript is the record the spec is built from. Never summarise it.
2. Write the round you are asking to `$ARTIFACTS_DIR/shape/current-round.md`, replacing what was there. The gate only shows an excerpt, so the person may read the full round there.
3. End your turn with the round itself, in the grilling format:

```
❓ **Q1** - **<question title>**: <question body, including choices>

➡️ <your recommended answer>

---

❓ **Q2** - ...
```

Word every question so that "yes" accepts your recommended answer. Ask the whole **frontier** in one round: every question whose prerequisites are already settled. A question that depends on another one still open this round belongs to a later round.

## Phase 1: grill with docs

Call the Skill tool for `grilling` and for `domain-modeling`, and follow both.

- Map the **design tree** and work it in rounds until every branch is visited and nothing is silently assumed.
- **Facts are your job, decisions are the person's.** When a question needs a fact from the codebase or the environment, dispatch a subagent to find it instead of asking. Only the questions downstream of a running exploration wait for it.
- **Domain model, inline.** Challenge terms against `GLOSSARY.md` (or the contexts in `GLOSSARY-MAP.md`), sharpen fuzzy language, stress-test relationships with concrete edge-case scenarios, and cross-reference claims with the code. Update `GLOSSARY.md` the moment a term is resolved, creating it lazily. Offer an ADR only when a decision is hard to reverse, surprising without context, *and* the result of a real trade-off. The offer is itself a question in a round; write the ADR in `docs/adr/` only after a yes.
- **When a question needs a runnable answer** (does this state model feel right?), call the Skill tool for `prototype` and build its logic branch as a single HTML file under `$ARTIFACTS_DIR/prototypes/`, never in the repo. Give the person its absolute path and ask the question it answers. For a UI question ("what should this look like?"), recommend they run `/prototype` in a separate session on its own branch and report back, and keep that question open until they do.
- **When a fact lives outside the repo** (a third-party API, a spec, a library's behaviour), call the Skill tool for `research`. Save the findings under `$ARTIFACTS_DIR/research/` with each claim cited, and point to them from the spec's Further Notes.

The phase ends when the frontier is empty. Then ask one question: a short list of the decisions reached, and "Have we reached a shared understanding?" Do not move on until the person confirms. On a yes, write `$ARTIFACTS_DIR/shape/understanding.md` (the decisions, each in a line or two, pointing into the transcript) and go straight to phase 2 in the same turn.

## Phase 2: to-spec

Synthesise. Do **not** interview the person here, except for the seams.

1. Explore the repo for the current state of the code the idea touches. Use the glossary's vocabulary throughout, and respect the ADRs in the area.
2. Sketch the **seams** the feature will be tested at. Prefer existing seams to new ones, and use the highest seam possible. If new seams are needed, propose them as high as you can: the fewer seams, the better, and the ideal number is one. Call the Skill tool for `codebase-design` for the vocabulary (module, interface, depth, seam, adapter, leverage, locality).
3. Ask the seams as a round: one question per proposed seam, each with a one-line note on what it catches and what it misses.
4. Once the seams are agreed, write `$ARTIFACTS_DIR/shape/spec.md` from the template below and go straight to phase 3 in the same turn.

<spec-template>

# <Feature title>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories, each in the format:

1. As an <actor>, I want a <feature>, so that <benefit>

This list should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

The implementation decisions that were made: the modules that will be built or modified, the interfaces of those modules that change, technical clarifications, architectural decisions, schema changes, API contracts, specific interactions.

Do NOT include specific file paths or code snippets; they go stale fast. Exception: when a prototype produced a snippet that encodes a decision more precisely than prose can (a state machine, reducer, schema, type shape), inline its decision-rich parts and note that it came from a prototype.

## Testing Decisions

What makes a good test here (only external behaviour, not implementation details), the agreed seams, which modules will be tested, and prior art for the tests in the codebase.

## Out of Scope

What is out of scope for this spec.

## Further Notes

Any further notes, including pointers to research and prototypes.

</spec-template>

## Phase 3: to-tickets

Break the spec into **tracer-bullet** tickets, each declaring the tickets that **block** it. Look for opportunities to prefactor first: make the change easy, then make the easy change.

- Each ticket cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, not a horizontal slice of one layer.
- A completed ticket is demoable or verifiable on its own.
- Each ticket fits in a single fresh context window.
- Any prefactoring comes first.
- **Wide refactors are the exception.** One mechanical change whose blast radius fans across the codebase (a renamed column, a retyped shared symbol) is sequenced **expand–contract**: expand (add the new form beside the old), migrate the call sites in batches sized by blast radius (each its own ticket, blocked by the expand), then contract (delete the old form, blocked by every batch).

Present the breakdown as a numbered list, each ticket with its **Title**, **Blocked by**, and **What it delivers** (the end-to-end behaviour it makes work). Point the person at `$ARTIFACTS_DIR/shape/spec.md` to read the spec. Then ask, as a round:

- Does the granularity feel right (too coarse, too fine)?
- Are the blocking edges correct, so that each ticket depends only on tickets that genuinely gate it?
- Should any tickets be merged or split?
- Anything to change in the spec?

Iterate until the person approves the breakdown. Only then write `$ARTIFACTS_DIR/shape/tickets.json`:

```json
{
  "feature": { "title": "<feature title, in glossary terms>", "slug": "<kebab-case-slug>" },
  "tickets": [
    {
      "key": "T1",
      "title": "<short descriptive name>",
      "what_to_build": "<the end-to-end behaviour this ticket makes work, from the user's perspective>",
      "acceptance": ["<specific, independently testable criterion>"],
      "blocked_by": []
    }
  ]
}
```

Ticket text uses the glossary's vocabulary and avoids file paths and code snippets (the same prototype exception applies).

Writing `tickets.json` ends the loop, so write it only after the person approves. Then run the validator, `bun "$ARTIFACTS_DIR/bin/validate-shape.ts"`, and fix whatever it reports in `spec.md` or `tickets.json` until it prints that the shape is publishable. End the turn with what will be published (the tracker, the spec title, every ticket with its blockers) and say: **approve with no comment to publish, or comment to revise.** If the person comments instead, revise both files, re-run the validator, and present them again.

## Never

- Write production code, commit, push, or create issues. The workflow publishes and commits after the final approval.
- Edit anything in the repo other than `GLOSSARY.md`, `GLOSSARY-MAP.md` and per-context glossaries, and ADRs under `docs/adr/`.
- Skip ahead of the person, or treat silence as a yes.
