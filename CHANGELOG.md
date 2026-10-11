# Changelog

## Unreleased

- Fix: the nodes that re-run project checks or a feedback loop (`gate` and `recheck` in `implement`, `ticket-gate` and `recheck` in `implement-spec`, `prove-red` and `prove-green` in `diagnose`) now declare `timeout: 3600000`. Without it Archon applied its 120 s script default, which stopped a gate long before the scripts' own per-command limits, so a repo whose checks take more than two minutes failed the run with no verdict. A test requires every such node to declare at least an hour.
- The check record (`checks/<label>.md`) is rewritten before and after each command, so a gate stopped part-way shows which commands finished and which one was running.

## Unreleased

- Fix: the pack names the skills plugin as `mattpocock-skills@mattpocock`, from Matt's own marketplace (`mattpocock/skills`), instead of `mattpocock-skills@claude-plugins-official`. The official listing is v1.2.3, below the v1.3 the pack needs and without the `pr` skill that `implement`, `implement-spec`, `idea-to-tickets` and `wayfinder-step` load, so `setup` could never pass with it. The id changes in every AI node's `plugins:`, the `setup` version gate and its cancel message, and the README install steps, which now add the marketplace first.

## v0.1.1 (2026-10-08)

- Fix: interactive gate replies now reach the session in `triage`, `idea-to-tickets`, `wayfinder-chart` and `wayfinder-step`. Archon substitutes `$LOOP_USER_INPUT` into a `loop_group` body node's YAML but not into the command file it loads, so every reply arrived empty, and only bare approvals worked. Each session now binds the reply with `with: { reply: "$LOOP_USER_INPUT" }` and reads `$INPUTS.reply`. A test guards against reading `$LOOP_USER_INPUT` in a command file again.

## v0.1.0 (2026-10-08)

First release: eleven workflows over Matt Pocock's skills v1.3.

- Main flow: `setup`, `idea-to-tickets`, `implement`, `implement-spec`, `code-review`.
- On-ramps: `triage`, `diagnose`, `wayfinder-chart`, `wayfinder-step`.
- Upkeep: `architecture`, `retro`.
- GitHub (native sub-issues and blocked-by edges) and local-markdown trackers.
- Deterministic gates: re-run checks, red/green feedback-loop proofs, shape/outcome/map validators, read-back on every public write.
