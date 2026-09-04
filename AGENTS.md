# Agent Guide

## Project Context

If `AGENTS_PROJECT_REFERENCE.md` exists, read it before substantial work. It defines project-specific architecture, constraints, terminology, validation requirements, and canonical documentation.

Project-specific guidance supplements this file. The user's current explicit instructions take priority.

Read only the project documentation relevant to the current task.

## Working Principles

* Understand the requested outcome before editing.
* Inspect existing code, tests, and conventions before choosing an implementation.
* Prefer established project patterns over introducing new ones.
* Implement the complete requested behavior and the support necessary for it to work correctly.
* Do not expand scope into unrelated refactors, migrations, cleanup, or speculative future work.
* Preserve existing behavior unless the requested change intentionally modifies it.
* Keep changes scoped, understandable, and reviewable.
* Resolve routine engineering decisions independently when the repository provides enough context.
* Ask the user only when a decision cannot reasonably be inferred and materially affects the result.

## Workflow

For non-trivial work:

1. Check repository status and preserve existing user changes.
2. Locate and understand the affected implementation, tests, and interfaces.
3. Determine the implementation approach and relevant risks.
4. Implement the requested behavior through completion.
5. Add or update tests where appropriate.
6. Run targeted validation while iterating.
7. Broaden validation according to regression risk.
8. Review the final diff for correctness, scope, and unintended changes.
9. Update documentation when behavior, architecture, interfaces, or project status changed.

Do not stop at an intermediate implementation when the requested task can reasonably be completed.

If the user requests planning only, do not implement.

## Context Efficiency

Protect the primary context.

* Search before opening large files.
* Read nearby implementation and tests before broad documentation.
* Do not automatically read the entire repository or large documents.
* Avoid rereading files already understood.
* Prefer relevant failure output over complete logs.
* Delegate repository investigation only when it is substantial enough to benefit.

## Subagents

Do not spawn subagents by default.

Use them only when delegation provides meaningful leverage, such as:

* Substantial independent investigation
* Clearly separable implementation work
* Complex failure analysis
* High-risk independent review
* Difficult architectural or correctness analysis

Avoid overlapping file ownership, duplicate investigations, unnecessary agent trees, or delegation of trivial work.

Use the least expensive capable agent defined in the available agent configuration. The primary agent remains responsible for integration and final correctness.

## Validation

Validation should be proportional to the change.

* Run focused tests during implementation.
* Run type checking, linting, builds, or broader tests when relevant to the project and risk.
* Test externally visible behavior rather than implementation details where practical.
* Reproduce failures narrowly before attempting fixes.
* Fix root causes rather than weakening tests or increasing timeouts without justification.
* Do not regenerate fixtures or expected outputs merely to make tests pass without understanding the change.

Project-specific validation requirements belong in `AGENTS_PROJECT_REFERENCE.md`.

## Git Safety

Treat existing modifications as intentional user work.

Do not:

* Discard unrelated changes.
* Reset or overwrite user modifications.
* Rewrite history.
* Force push.
* Commit or push unless requested.

Keep repository changes scoped to the requested work.

## Definition of Done

A task is complete when:

* The requested behavior is implemented.
* Necessary supporting changes are included.
* Relevant tests are added or updated.
* Appropriate validation passes.
* The final diff has been reviewed.
* No known regression caused by the change remains.
* Documentation is updated where necessary.
* Unrelated changes are excluded.

## Final Handoff

Keep the final report concise. Include:

* What changed
* Important implementation decisions
* Validation performed
* Known limitations, risks, or pre-existing failures

Do not narrate routine searches, file reads, commands, or raw test output.
