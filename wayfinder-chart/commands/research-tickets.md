# Resolve the map's research tickets

The map `$publish.output.map_ref` has just been charted. Its research tickets are listed in `$ARTIFACTS_DIR/wayfinder/published.json` under `research`, each with its key, ref, title and question. The map itself, with its destination and notes, is in `$ARTIFACTS_DIR/wayfinder/map.json`.

Resolve every research ticket, **in parallel**: for each one, spin up a subagent that calls the Skill tool with `research`. Each subagent:

1. Investigates its question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them, following every claim back to the source that owns it.
2. Writes its findings to `$ARTIFACTS_DIR/research/<key>.md`, citing each claim's source. The findings become the ticket's resolution, so open with the answer to the question, then the evidence.

When every subagent has reported, write `$ARTIFACTS_DIR/research/resolutions.json`, one entry per ticket you resolved:

```json
[{ "key": "Q3", "gist": "<one line, enough to judge relevance from the map's index>" }]
```

Leave out any ticket whose question the sources could not answer. It stays open on the frontier, and you should say why in your final message. Don't edit the repository, the tracker, or the map; the next node records each resolution and reads it back.
