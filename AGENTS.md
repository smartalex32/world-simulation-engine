# World Simulation Engine — Agent Guide

## Mission

Build the application incrementally into an explainable, reproducible, spatial, stochastic agent-based world simulator.

The core product loop is:

```text
geography and environment
  -> individual exposure and experience
  -> probabilistic behavior and development
  -> social interaction
  -> emergent community conditions
  -> new exposure for current and future people
```

The application may eventually support very large worlds and long time spans, but development should proceed through small, independently testable vertical slices.

Unless the user explicitly requests a larger scope, complete one coherent, independently reviewable slice per task.

---

# Canonical Sources

Use project documents according to their responsibilities:

* `AGENTS.md` — development rules, agent behavior, validation, and implementation constraints.
* `README.md` — currently implemented architecture, runtime model, and system boundaries.
* `docs/ROADMAP.md` — milestone status, planned sequencing, future capabilities, and deferred scope.
* `docs/TRAIT_AND_INFLUENCE_SYSTEM.md` — detailed person-variable, influence, exposure, development, and community-feedback semantics.
* Tests and serialized fixtures — executable reproducibility and compatibility contract.

Do not assume roadmap features are already implemented.

Do not assume design documentation silently overrides current supported behavior.

When implementation, tests, and documentation disagree:

1. Determine the actual supported behavior.
2. Preserve it unless the requested change intentionally modifies it.
3. Identify which documentation or contract is stale.
4. Update affected documentation as part of the change.
5. Never silently reinterpret persisted simulation state.

Read only the documentation relevant to the current task.

---

# Non-Negotiable Simulation Contracts

## No Generative AI in Simulation Behavior

Do not add LLM calls, generated agent decisions, external AI-service dependencies, or AI-generated authoritative simulation state.

AI may assist development but must not participate in authoritative simulation execution.

## Reproducibility

Identical versioned inputs and seed must produce identical canonical simulation output.

Authoritative outcomes must not depend on:

* Wall-clock time
* Browser timing
* Rendering timing
* Worker scheduling
* Machine performance

## Centralized Randomness

Simulation randomness must come only from named, seeded, snapshot-restorable RNG streams.

Never use `Math.random()` or another untracked random source for authoritative simulation behavior.

Random draws must have explicit ownership.

Adding, removing, or reordering random draws is a simulation-contract change and must be handled deliberately.

## Explainability

Important decisions, interactions, and developmental changes should retain structured explanation data where applicable, including:

* Base value
* Contributing factors
* Modifier sources
* Final score
* Probability
* Random result
* Selected outcome
* Development delta
* Relevant rounding or clamping

Prefer structured traces over formatted explanation strings.

## Semantic Separation

Keep conceptually different state distinct, including:

* Traits and dispositions
* Values, attitudes, and beliefs
* Short-term states
* Needs
* Skills
* Relationships
* Experiences
* Community conditions
* Structural conditions
* Environment

Shared infrastructure is acceptable, but semantics and ownership must remain explicit.

## Exposure Over Membership

Influence should generally arise from actual exposure:

* Where people spend time
* What they experience
* Who they encounter
* How strong and persistent that exposure is

Do not automatically transfer properties from a community, settlement, household, organization, or future political unit into a person simply because they are associated with it.

## Sparse Influences

Use explicit, typed, sparse influence edges.

Do not create a complete pairwise variable matrix.

## Simulation/UI Separation

The UI may:

* Send commands
* Request projections
* Display projected state
* Present diagnostics
* Provide authoring controls

The UI must not directly mutate authoritative simulation state.

Authoritative simulation and draft-world mutation remain behind the worker boundary.

## Stable Serialization

Preserve:

* Explicit schema versions
* Engine/model versions
* Stable ordering
* Explicit units
* Validation boundaries
* Explicit migration or rejection behavior

Never silently reinterpret an incompatible serialized format.

## Incremental Scope

Do not implement future systems merely because they may eventually be useful.

Avoid speculative architecture for distant systems such as politics, warfare, religion, language, detailed economics, technology, disease, genetics, narrative generation, multiplayer, or massive cohort simulation unless a current requirement needs a concrete boundary.

---

# Architectural Rules

`README.md` is the authoritative description of the current architecture.

Before modifying an unfamiliar subsystem, inspect its current ownership and interfaces.

Always preserve these boundaries:

* Authoritative simulation state remains outside the UI.
* The worker owns authoritative simulation execution.
* Draft-world mutation remains worker-owned.
* RNG behavior belongs to the RNG subsystem.
* Variables, influences, relationships, exposure, development, and community state are changed through their owning systems.
* Persistence owns snapshot/import/export validation and migration behavior.
* Projection and rendering state are non-authoritative.
* Rendering behavior must not affect canonical simulation results.

Do not bypass subsystem ownership merely because direct mutation would be easier.

---

# Roadmap and Scope

`docs/ROADMAP.md` is authoritative for milestone sequencing.

When the user requests a specific change:

* The requested change takes priority over roadmap order.
* Consult the roadmap only when its scope or prerequisites matter.
* Implement only the support necessary to complete the requested change.

When the user says to continue development without specifying a feature:

1. Read the current relevant roadmap section.
2. Verify milestone status against the implementation and tests.
3. Select the next unfinished independently reviewable slice.
4. Do not reimplement already completed work.
5. Do not skip ahead without a concrete dependency or user direction.

If implementation proves that roadmap status is stale, update the roadmap.

---

# Agent Strategy

The primary agent is expected to use:

```text
GPT-5.6 Terra
Reasoning: Medium
```

The primary agent should normally perform:

* Routine repository exploration
* Planning
* Implementation
* Targeted validation
* Integration
* Self-review
* Documentation updates

Do not spawn a subagent by default.

A cheaper agent still consumes context and credits. Delegate only when doing so provides meaningful leverage.

## Subagents

* `explorer` — Luna Low. Use for substantial cross-repository investigation, unfamiliar execution paths, or impact analysis. Do not use for simple searches.
* `tester` — Luna Medium. Use for non-trivial test-failure investigation, flaky/browser-specific failures, reproducibility regressions, or broad validation analysis. Do not use merely to run known commands.
* `worker` — Terra Medium. Use only for substantial, genuinely independent implementation work with little overlapping file ownership.
* `reviewer` — Terra High. Use when independent review materially reduces risk for high-impact changes.
* `architect` — Sol High. Use only for difficult architectural or correctness problems that Terra cannot resolve reliably.

Do not use subagents merely to make the workflow look more agentic.

Do not create several agents to solve the same problem unless competing analyses are explicitly valuable.

Do not create unnecessary recursive agent trees.

---

# When to Use Higher-Cost Agents

## `worker`

The primary Terra agent should normally implement changes itself.

Use a worker only when work can be divided into clearly independent pieces, such as:

* Independent frontend and backend work behind an established interface
* Independent worker and UI work after the protocol is already defined
* Separate migration tooling
* Independent subsystems with stable boundaries

Avoid multiple agents modifying tightly coupled files concurrently.

## `reviewer`

Primary-agent self-review is sufficient for ordinary changes.

Use an independent reviewer for higher-risk work such as:

* RNG stream or draw-order changes
* Snapshot/schema changes
* Migrations
* Persistence compatibility changes
* World-generation contract changes
* Cross-cutting authoritative simulation changes
* Complex worker concurrency or continuation behavior
* Large deterministic refactors
* Data-integrity-sensitive changes

## `architect`

Use Sol only when:

* A major architectural choice has substantial long-term consequences.
* Several approaches have materially different tradeoffs.
* A difficult deterministic, concurrency, or serialization problem remains unresolved.
* Terra has made reasonable attempts without reaching a reliable solution.

Prefer asking the architect to analyze and recommend an approach. Terra should normally implement the result.

---

# Context Efficiency

Protect the primary context.

Do not automatically read:

* The entire repository
* The entire README
* The entire roadmap
* Every design document
* Large test logs

Instead:

1. Inspect `git status`.
2. Understand the requested behavior.
3. Search for the affected implementation.
4. Read nearby code and tests.
5. Read relevant architecture or design documentation only when needed.

Use `explorer` only when repository investigation becomes substantial.

Search before opening large files.

Avoid repeatedly reading files already understood.

For failures, prefer the relevant assertion and nearby error context over complete logs.

Subagents should return concise findings rather than raw output dumps.

---

# Change Classification

Before implementation, determine whether the change affects authoritative simulation behavior.

Treat a change as simulation-affecting if it alters:

* Simulation rules
* Tick ordering
* Opportunity generation
* Action evaluation
* RNG draws or ownership
* Coefficients or units
* Fixed-point calculations
* Authoritative state
* Serialization
* Snapshot restoration
* World generation
* Registry ordering
* Canonical digests

For simulation-affecting changes, explicitly determine whether any of these must change:

* `ENGINE_VERSION`
* `SNAPSHOT_SCHEMA_VERSION`
* World-generator version
* Registry/model versions
* Canonical digest fixtures

Do not increment versions automatically.

Increment only when the corresponding behavioral or compatibility contract changes.

---

# Implementation Workflow

## 1. Understand

Determine:

* Existing behavior
* Requested behavior
* Smallest complete implementation
* Affected subsystem boundaries
* Whether authoritative output changes
* Whether persistence or versioning changes
* Appropriate validation level

## 2. Inspect

Read the relevant implementation, existing patterns, interfaces, and nearby tests.

Perform simple repository exploration directly.

Delegate only when investigation becomes substantial.

## 3. Plan

For non-trivial changes, establish a concise plan.

Prefer a vertical slice:

```text
domain/configuration
  -> simulation behavior
  -> worker/persistence if required
  -> projection/UI if required
  -> tests
```

Do not produce elaborate plans for trivial work.

## 4. Implement

Prefer:

* Pure functions
* Explicit inputs
* Stable ordering
* Deterministic tie-breaking
* Typed identifiers
* Fixed-point authoritative calculations where appropriate
* Named configuration
* Explicit units

Centralize meaningful coefficients in registries, configuration, or versioned model definitions.

Avoid:

* Scattered unexplained constants
* Direct mutation across subsystem boundaries
* Unrelated refactors
* Future-roadmap implementation not required by the task

## 5. Make Behavior Inspectable

Important behavior should be observable through appropriate:

* Structured events
* Explanation traces
* Metrics/statistics
* Inspector data
* Diagnostic projections

Do not rely solely on console logs.

## 6. Validate

Run the narrowest useful validation while iterating.

Fix targeted failures before broadening the test scope.

## 7. Review

Inspect the complete final diff.

For ordinary changes, self-review is sufficient.

Use an independent reviewer only when risk justifies the additional model work.

## 8. Document

Update documentation according to ownership:

* Current architecture or boundaries → `README.md`
* Roadmap status or future scope → `docs/ROADMAP.md`
* Detailed simulation model semantics → relevant design documentation
* Persistence/version contracts → relevant docs and tests

Do not duplicate detailed architecture or roadmap content in `AGENTS.md`.

## 9. Pull Request Visual Evidence

For a pull request that changes a user-visible UI surface, capture an updated
screenshot during validation and add it to the pull request description or a
pull request comment when GitHub upload access is available.

Do not commit validation screenshots or other review-only media to the
repository. If upload access is unavailable, state that briefly in the PR and
provide the screenshot directly to the user when requested.

## 10. Roadmap and Issue Synchronization

`docs/ROADMAP.md` is the source of truth for planned milestones. Every planned
milestone must link to a corresponding GitHub issue. In the same change/PR,
create and link an issue for a new milestone, update the issue for a changed
title/scope/status/sequence, and delete the issue when the milestone is removed.

---

# Validation Strategy

Testing should be proportional to risk.

Do not run every test suite after every small edit.

## Level 1 — Local or Mechanical

Examples:

* Documentation
* Styling
* Labels
* Isolated presentational changes
* Mechanical non-behavioral refactors

Typical validation:

```powershell
pnpm typecheck
```

Run relevant targeted tests or `pnpm build` when necessary.

Do not automatically run the complete unit or E2E suite.

## Level 2 — Application Behavior

Examples:

* UI interaction
* Projection behavior
* Worker command handling
* Draft-map interaction
* Non-authoritative application logic

During iteration:

* Run directly affected tests.
* Run targeted Playwright flows when relevant.
* Run `pnpm typecheck`.
* Run `pnpm build` when integration may be affected.

Broaden validation only when the change has wider regression risk.

## Level 3 — Simulation Contract

Examples:

* Simulation rules
* RNG behavior
* Variables or influences
* Activities or relationships
* Exposure or development
* Community calculations
* World generation
* Serialization or snapshots

During implementation, use the relevant combination of:

* Targeted unit tests
* Fixed-seed regression tests
* Controlled scenarios
* Statistical multi-seed tests
* Invariant tests
* Persistence tests
* Relevant E2E tests

Before handoff, validation generally includes:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Run the full E2E suite when broad browser/worker integration or milestone-level regression risk justifies it.

## Level 4 — Milestone or Release

Run:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Do not repeatedly run the full suite during iteration.

---

# Test Rules

Use the test type appropriate to the behavior.

* Exact unit tests — formulas, fixed-point calculations, bounds, deterministic transforms, utility logic.
* Fixed-seed tests — exact reproducibility contracts.
* Controlled scenarios — isolate one causal difference.
* Multi-seed statistical tests — probabilistic tendencies.
* Invariant tests — legal bounds, valid references, conservation, impossible states/actions.
* Persistence tests — round trip, validation, migration/rejection, RNG restoration, compatibility.
* Playwright tests — important UI, worker, rendering, persistence, world-creation, and authoring workflows.

Do not infer probabilistic tendencies from one seed.

Do not regenerate fixtures merely to make tests pass without understanding the output change.

For asynchronous worker/UI tests:

* Prefer waiting on observable application state.
* Avoid fixed-time sleeps when a meaningful completion signal exists.
* Do not increase timeouts merely to hide synchronization bugs.

When debugging failures:

1. Reproduce the narrowest failure.
2. Identify the root cause.
3. Fix it.
4. Rerun the targeted test.
5. Broaden validation after targeted tests pass.

---

# Reproducibility Checklist

For every simulation-affecting change, verify as applicable:

* Canonical output impact
* RNG draw count
* RNG draw ordering
* RNG stream ownership
* Snapshot-restored RNG state
* Canonical digest impact
* Engine/schema/model version impact
* Stable collection ordering
* Deterministic tie-breaking
* Fixed-point conversion
* Rounding semantics
* Explanation trace correctness
* Explicit migration or rejection of incompatible state

Never silently accept incompatible serialized state.

---

# Performance and Rendering

Detailed architecture belongs in `README.md`.

Preserve these general rules:

* Avoid global O(N²) agent interaction where bounded/indexed approaches are available.
* Prefer spatial indexes and bounded queries.
* Keep viewport projections bounded.
* Keep rendering fidelity separate from simulation fidelity.
* Avoid transferring authoritative world-scale data when projections suffice.
* Preserve responsive worker execution.
* Keep person markers bounded in screen space.
* Do not let draft edits mutate a live authoritative world before explicit commit.

When optimizing performance:

1. Measure first.
2. Identify the actual bottleneck.
3. Optimize that bottleneck.
4. Verify reproducibility.
5. Add regression coverage where appropriate.

Do not build speculative scaling infrastructure without demonstrated need.

---

# Scope Control

Implement the requested behavior and the support required to make it complete.

Do not automatically expand the task into:

* Broad refactors
* Framework replacements
* Dependency migrations
* New simulation systems
* Future roadmap milestones
* Unrequested performance redesign
* General architectural cleanup

If a larger improvement would be useful but is not required, mention it after completing the requested work rather than implementing it automatically.

If a task is too large for one independently verifiable slice, complete the smallest coherent slice unless the user explicitly requested the entire larger scope.

---

# Git Safety

Before significant edits:

```powershell
git status
```

Treat existing modifications as intentional user work.

Do not:

* Discard unrelated changes
* Reset files
* Force checkout over modifications
* Rewrite history
* Force push
* Commit unless requested
* Push unless requested

Keep modifications scoped to the requested work.

---

# User Interaction

Prefer resolving routine engineering decisions from:

* The user's request
* Existing architecture
* Existing conventions
* Tests
* Canonical documentation

Do not ask the user for information that can safely be inferred from the repository.

Ask only when a decision:

* Cannot reasonably be inferred
* Materially changes product behavior
* Has several meaningfully different valid outcomes
* Requires unavailable information

For minor, reversible uncertainty, follow the closest established pattern and continue.

If the user requests planning only, do not implement.

The user's explicit current instructions override roadmap priority and general guidance in this file.

---

# Definition of Done

A change is complete when:

* Requested behavior is implemented.
* Necessary supporting changes are included.
* Architectural ownership remains correct.
* Authoritative simulation ownership remains outside the UI.
* Important behavior is inspectable where appropriate.
* Relevant tests are added or updated.
* Targeted validation passes.
* Broader validation proportional to risk passes.
* Reproducibility remains intact or an intentional versioned change has been made.
* Persistence compatibility is explicit when affected.
* The final diff has been reviewed.
* No known regression caused by the change remains.
* No unnecessary unrelated changes are included.
* Relevant documentation is current.
* Deferred systems remain deferred unless explicitly requested.

Primary-agent self-review satisfies the review requirement for ordinary changes.

---

# Final Handoff

Keep the final report concise.

Include:

* What changed
* Important implementation decisions
* Tests and validation performed
* Version or migration impact, if any
* Reproducibility impact, if any
* Known limitations or pre-existing failures
* What intentionally remains deferred

Include the next roadmap slice only when relevant.

Do not narrate routine searches, every file read, every command executed, or large raw test logs.
