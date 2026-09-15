# Agent Guide

## Context and scope

- Read `AGENTS_PROJECT_REFERENCE.md` before substantial work when it exists, then
  only relevant documentation. Follow applicable nested guidance.
- Complete the user's authorized task. Planning-only requests produce a plan
  without implementation. Avoid unrelated refactors and speculative features.
- Infer routine decisions from the repository. Ask only for missing information
  that materially affects the result and cannot reasonably be inferred.

## Execution

1. Check repository status and inspect the affected implementation and tests.
2. Choose the smallest complete change that follows established project patterns.
3. Implement the requested behavior and necessary tests or documentation.
4. Validate proportionally, inspect the final diff, and fix issues caused by the change.

Preserve existing behavior outside the request. Avoid unnecessary dependencies and
placeholder implementations. Search before opening large files; summarize evidence
instead of dumping logs.

## Delegation

Handle small tasks directly. Delegate when the user requests it or when a
substantial independent subtask would materially improve progress or confidence.
In that case, use the least expensive capable configured role.

- Give each subagent a concrete outcome, relevant context, owned files or subsystem,
  acceptance criteria, validation expectations, and concise return format.
- Keep file ownership separate and avoid duplicate investigation. Subagents do not
  delegate further; the primary agent owns coordination and integration.
- Select specialists using descriptions in `.codex/agents/`. Reserve `architect`
  for difficult decisions or unresolved problems.
- Use `tester` for execution and basic triage, `debugger` for nontrivial diagnosis,
  and `worker` for fixes and complex test implementation. Pass existing evidence
  between them instead of restarting investigation.
- Route high-risk security, data-loss, or cross-system correctness questions to
  `architect` directly when the scope warrants it. Cheap-first is not mandatory.
- Use `escalation-advisor` (Astra/high) for exceptional complexity or costly
  correctness risks, or when focused debugger/architect work remains unresolved.
  Direct use is appropriate when the difficulty is already clear. Give it one
  bounded question and prior evidence; do not make it a routine review stage.
- If attempts stop producing useful evidence, narrow or escalate the task instead
  of repeating equivalent runs. Do not invoke every role as a routine checklist.
- Verify delegated results, resolve integration issues, and wait for necessary
  work before reporting completion. Concurrency limits are ceilings, not targets.

## Validation

- Use project commands from `AGENTS_PROJECT_REFERENCE.md` when available.
- Start with focused checks; broaden according to regression risk.
- Add meaningful behavioral tests when appropriate. Avoid tests that repeat the
  implementation or add no confidence to a low-impact documentation edit.
- Investigate failures before changing code or expectations. Never weaken checks
  solely to obtain a pass. Distinguish new, pre-existing, and unclassified failures.
- Report what actually ran and any relevant checks that could not run.

## Change safety

- Preserve user modifications and concurrent work; do not discard unrelated changes.
- Do not rewrite history, force push, or commit or push unless the user requests it.
- Keep secrets, machine-specific paths, runtime state, and generated outputs out of
  shared configuration. Respect active permissions and external-action authorization.

## Completion

Finish when the requested outcome is implemented, appropriate checks pass, the diff
is reviewed, and necessary documentation is current. State remaining blockers
accurately. Keep the handoff concise: outcome, important decisions, validation,
and material limitations.
