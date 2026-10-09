# Changelog

## v0.1.1 (2026-10-08)

- Fix: interactive gate replies now reach the session in `triage`, `idea-to-tickets`, `wayfinder-chart` and `wayfinder-step`. Archon substitutes `$LOOP_USER_INPUT` into a `loop_group` body node's YAML but not into the command file it loads, so every reply arrived empty, and only bare approvals worked. Each session now binds the reply with `with: { reply: "$LOOP_USER_INPUT" }` and reads `$INPUTS.reply`. A test guards against reading `$LOOP_USER_INPUT` in a command file again.

## v0.1.0 (2026-10-08)

First release: eleven workflows over Matt Pocock's skills v1.3.

- Main flow: `setup`, `idea-to-tickets`, `implement`, `implement-spec`, `code-review`.
- On-ramps: `triage`, `diagnose`, `wayfinder-chart`, `wayfinder-step`.
- Upkeep: `architecture`, `retro`.
- GitHub (native sub-issues and blocked-by edges) and local-markdown trackers.
- Deterministic gates: re-run checks, red/green feedback-loop proofs, shape/outcome/map validators, read-back on every public write.
