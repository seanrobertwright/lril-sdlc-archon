# Changelog

## Unreleased

- Fix: a flaky check no longer costs a whole `implement` or `implement-spec` run. The gate runs a command that fails once more. A command that passes on that second run counts as passed, and is marked flaky in `checks/<label>.md`, in `checks/flaky.json`, in the run's outcome and in the PR body, so a reviewer can tell a known flake from one the change introduced. A command that fails both times still fails the gate. Four of the five failed runs seen so far ended this way, on a test that fails intermittently on the target project's own main branch. A gate that fails on its checks now ends its message with the `archon workflow resume <run-id> --detach` command that reruns it without redoing the work before it.

- Fix: an interactive session's draft is published only after you approve it, as shown, with no comment. This applies to `triage`'s outcome, `idea-to-tickets`' spec and tickets, `wayfinder-chart`'s map and `wayfinder-step`'s resolution. In an interactive `loop_group`, Archon v0.11.1 gates only the first iteration when the completion check passes. On every later iteration a passing check ends the loop at once, so a session that wrote a valid draft and then asked for approval had it published before anyone read it. Each loop's `until_bash` now runs its validator with `--gate`, which passes only when the reply that opened the iteration is a bare `Approved` and the draft is unchanged since the last gate showed it. A reply that never arrives can't approve anything. The session prompts say the same, and treat an empty reply after the first turn as lost rather than as agreement.
- Fix: `triage` commits the glossary terms and ADRs its session writes inline. Before, they were left uncommitted.
- Domain-doc commits also stage `CONTEXT.md` and `CONTEXT-MAP.md`, the glossary's name before Matt's skills v1.3, so a repo that hasn't renamed it doesn't lose a session's edits. `setup` names the `git mv` that Matt's changelog prescribes when it finds one.
- `wayfinder-step` says in its description that, without `--input map`, the run's message must be the map reference. When it isn't one, the error says so.
- Fix: the nodes that re-run project checks or a feedback loop (`gate` and `recheck` in `implement`, `ticket-gate` and `recheck` in `implement-spec`, `prove-red` and `prove-green` in `diagnose`) now declare `timeout: 3600000`. Without it Archon applied its 120 s script default, which stopped a gate long before the scripts' own per-command limits, so a repo whose checks take more than two minutes failed the run with no verdict.
- Fix: a gate now has a total budget, `CHECK_BUDGET_MS` (55 minutes), below its node's one-hour timeout. Each command gets the 20-minute per-command limit or what is left of the budget, whichever is less. A command stopped at the budget fails, and the commands after it are recorded as not run, so a gate with many slow checks returns a verdict naming them instead of being stopped by Archon. A test requires each check-running node's timeout to exceed what its script can spend: the gate budget, or the feedback loop's runs (plus the regression test, for `prove-green`) at the loop's per-run limit.
- The check record (`checks/<label>.md`) is rewritten before and after each command, so a gate stopped part-way shows which commands finished and which one was running.
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
