# Retrospective

Conduct Matt Pocock's `/retro` on a finished run. You are suggesting improvements to the coding agent's **environment**, so future runs go better. You are not reviewing the code. Change nothing; propose.

1. Call the Skill tool with `writing-for-agents`. It is the style guide for anything you propose an agent should read.
2. Read the primary sources for run `$locate.output.run_id` (`$locate.output.workflow`):
   - the condensed transcript: `$ARTIFACTS_DIR/session/transcript.md` (the raw JSONL is beside it at `session/log.jsonl`);
   - that run's artifacts, when present: `$locate.output.artifacts` (implementation reports, review reports, check records, diagnoses).
3. Read the environment the run worked in: `CLAUDE.md`/`AGENTS.md` (repo and global), `CODING_STANDARDS.md`, the docs they point to, the repo's own check commands (`package.json` or build-tool `lint`/`check` scripts), its CI workflow, and any pre-commit hooks.

## Look for candidates in these categories

- **Navigation**: how easy was it for the agent to find the right files? Are there hidden dependencies between files? Would a **navigation pointer** help? *Use when* the run took a long time to find a piece of information.
- **Automated checks**: could a check (lint, types, tests, a filesystem linter) have caught a mistake the agent made? Read the repo's own check command first, so that a check which exists but sits unwired or silently broken is the finding, not a reinvention. A repo with no **guardrail** (no pre-commit hook and no CI job running its lint, typecheck or tests) is itself a finding. *Use when* the agent made a mistake a check could have caught, or the repo has no guardrail.
- **Coding standards**: should the **reviewer agent** get a new rule, or should a rule be removed or clarified? Classify the violation first. A **mechanical** one (a fixed syntactic pattern, a banned API, an import shape, a file-location rule) gets a deterministic check, full stop: a custom rule in the repo's linter, a pre-commit hook, or a CI job, whichever is cheapest. Default to building the check over writing the rule. Reserve `CODING_STANDARDS.md` for genuine **judgement calls**. *Use when* the reviewer failed to catch a mistake.
- **Global AGENTS.md**: should steering instructions move into coding standards or automated checks instead? *Use when* AGENTS.md/CLAUDE.md is particularly large, in the repo or in the user's global scope.
- **Tool economy**: did the agent make expensive tool calls that could be streamlined? Is there token-inefficient custom tooling (CLIs, MCPs)? *Use when* the run made an expensive tool call.
- **No-ops**: instructions in steering files that don't change the agent's behaviour. *Use when* steering files are large and unwieldy.
- **Information access**: chances to give the agent more information, such as teed dev-server logs or read-only access to third-party services. *Use when* a crucial piece of information was unavailable.

Remember the split. All work goes through implementation and review. The implementation agent carries the most context pressure (exploring, writing, debugging). The review agent receives a diff and carries the least, so coding standards belong with review, not implementation. `CLAUDE.md`/`AGENTS.md` reach every agent's context, so keep them to navigation pointers. `CODING_STANDARDS.md` is read during review. Docs are references reached by pointers; look for existing ones before proposing new ones.

## Write the retro

Write `$ARTIFACTS_DIR/retro.md` with the candidates **in order of severity**, each as:

```markdown
## 1. <short title>

**Category:** <one of the categories above>
**Evidence:** <what happened in the run, quoted or pointed to in the transcript>
**Change:** <the concrete edit: the check to add, the rule to write or remove, the pointer to add, with its exact location>
**Why it prevents a repeat:** <one or two sentences>
```

Cite the transcript for every claim. If the run genuinely went well, say "No candidates" and why. Don't pad.
