# Resolve one research ticket

You are resolving one **research** ticket (AFK) on a wayfinder map. No one is watching.

- The ticket: `$ARTIFACTS_DIR/wayfinder/ticket.md` ($load.output.ticket_ref: **$load.output.title**). Its question is what you answer.
- The map: `$ARTIFACTS_DIR/wayfinder/map.md`. Orient to its Destination, and consult the skills its Notes name. Every ticket on the map: `$ARTIFACTS_DIR/wayfinder/tickets-index.md`.

Call the Skill tool with `research` and follow it. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not secondary write-ups, following every claim back to the source that owns it. Write the cited findings to `$ARTIFACTS_DIR/research/findings.md`.

Then write `$ARTIFACTS_DIR/wayfinder/resolution.json`, with the answer opening with the direct answer to the question:

```json
{
  "answer": "<the findings, in markdown, every claim cited>",
  "gist": "<one line for the map's Decisions so far>",
  "new_tickets": [],
  "not_yet_specified": null,
  "out_of_scope": [],
  "close_tickets": []
}
```

Fill `new_tickets` (with `key`, `title`, `type`, `question`, `blocked_by`) only when the findings make a new question sharp, and `not_yet_specified` (the full new text of that section) only when they let fog graduate. Existing refs are the ones in `tickets-index.md`. Run `bun "$ARTIFACTS_DIR/bin/validate-resolution.ts"` and fix whatever it reports. Don't edit the repo or the tracker; the next node records the resolution and reads it back.
