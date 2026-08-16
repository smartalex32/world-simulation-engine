# World Simulation Engine — Agent Guide

## Mission

Build the application incrementally into an explainable, reproducible, spatial, stochastic agent-based world simulator.

The core product hypothesis is:

```text
geography and environment
  -> individual exposure and experience
  -> probabilistic behavior and development
  -> social interaction
  -> emergent community conditions
  -> new exposure for current and future people
```

The application must eventually support very large worlds and long time spans, but each change should validate one small part of this loop before adding more scope.

Favor small, independently testable vertical slices over broad implementations.

---

# Canonical Sources

Use these sources according to their responsibilities:

- `AGENTS.md` defines engineering rules, agent behavior, delegation, validation, and implementation constraints.
- `README.md` describes the currently implemented architecture, repository structure, runtime model, and current system boundaries.
- `ROADMAP.md` defines milestone status, planned sequencing, future capabilities, and explicitly deferred areas.
- `docs/TRAIT_AND_INFLUENCE_SYSTEM.md` defines the target person-variable, sparse influence, exposure, behavior, development, and community-feedback model.
- Tests and serialized fixtures define the executable reproducibility and compatibility contract.

Do not assume planned roadmap behavior is already implemented.

Do not assume design documentation automatically overrides implemented behavior.

When implementation, documentation, roadmap status, and tests disagree:

1. Preserve existing supported behavior unless the requested change intentionally modifies it.
2. Identify the mismatch.
3. Determine which source is stale or whether an intentional behavioral migration is required.
4. Update affected documentation as part of the completed change.
5. Never silently reinterpret serialized simulation state or reproducibility semantics.

---

# Core Engineering Contracts

These rules are non-negotiable unless the user explicitly requests an intentional architectural or simulation-contract migration.

## No Generative AI in Simulation Behavior

Do not add:

- LLM-based agent decisions
- Generated runtime behavior
- External AI-service dependencies used by the simulation
- AI-generated authoritative simulation state

AI may assist software development but must not participate in authoritative simulation execution.

---

## Reproducibility

Identical:

- Initial state
- Configuration
- Engine version
- World-generator version
- Registry versions
- Seed

must produce identical canonical simulation output.

Rendering timing, browser timing, worker scheduling, and wall-clock timing must not affect authoritative simulation results.

---

## Centralized Randomness

Simulation randomness must come exclusively from:

- Named RNG streams
- Seeded generators
- Snapshot-restorable RNG state

Never use:

- `Math.random()`
- Wall-clock time
- Browser timing
- Rendering timing
- Untracked pseudo-random sources

for authoritative simulation outcomes.

Random draws must have clear ownership.

Adding, removing, or reordering random draws is a simulation-contract change and must be treated deliberately.

---

## Explainability

Important decisions, interactions, and developmental changes must expose enough structured information to explain why they occurred.

Where applicable retain:

- Base value
- Context contributions
- Influence contributions
- Source identifiers
- Edge identifiers
- Final score
- Probability
- Random result
- Selected outcome
- Development delta
- Clamp or rounding behavior

Prefer structured traces over formatted explanation strings.

The UI may format structured traces for people, but the authoritative explanation data should remain machine-readable.

---

## Semantic Separation

Keep conceptually different state separate.

Do not collapse the following into a generic undifferentiated value system:

- Traits
- Dispositions
- Values
- Attitudes
- Beliefs
- Short-term states
- Needs
- Relationships
- Experiences
- Skills
- Community conditions
- Structural conditions
- Environment

Shared registry/storage infrastructure is acceptable where appropriate, but semantics and ownership must remain explicit.

---

## Exposure Over Membership

A person is influenced by:

- Where they spend time
- What they experience
- Who they encounter
- The strength and duration of those exposures

Do not automatically assign every property of a named settlement, community, household, organization, or future political unit to a person merely because they are associated with it.

Membership and exposure are distinct concepts.

---

## Sparse Influence Graphs

Use explicit typed influence edges.

Do not create a complete pairwise variable matrix.

Influence relationships should be:

- Named
- Typed
- Sparse
- Inspectable
- Versioned when necessary
- Indexed by target or another efficient access path

---

## Simulation/UI Separation

The UI:

- Sends commands
- Requests projections
- Displays projected state
- Presents diagnostics
- Provides authoring controls

The UI must not directly mutate authoritative simulation state.

Authoritative simulation and draft-world mutation belong behind the worker-owned simulation boundary.

---

## Stable Serialization

Maintain:

- Explicit snapshot schema versions
- Engine versions
- World-generator versions
- Registry versions
- Stable ordering
- Explicit units
- Validation boundaries
- Explicit migration or rejection behavior

Do not silently reinterpret older serialized state.

If old formats are unsupported, reject them clearly.

If migration is implemented, make it explicit and test it.

---

## Incremental Scope

Do not implement future systems merely because they may eventually be useful.

Create an abstraction for a future capability only when the current change requires a real architectural boundary.

Avoid speculative frameworks for:

- Politics
- Warfare
- Religion
- Language
- Detailed economics
- Technology
- Disease
- Genetics
- Narrative generation
- Multiplayer
- Massive cohort simulation

until current simulation requirements create a concrete need.

---

# Architectural Boundaries

Keep responsibilities separated.

## `src/simulation/domain`

Owns:

- Serializable authoritative state
- Typed identifiers
- Core domain structures
- Versioned simulation-state contracts

---

## `src/simulation/rng`

Owns:

- Seeded RNG streams
- RNG state
- Stream naming
- Deterministic random selection
- Snapshot restoration of RNG state

---

## `src/simulation/spatial`

Owns:

- Coordinates
- Hex geometry
- Spatial indexing
- Neighborhood queries
- Effective distance
- Pathing
- Spatial partitioning
- Passability calculations

---

## `src/simulation/agents`

Owns:

- Opportunity generation
- Decision evaluation
- Action utility
- Probabilistic selection
- Action execution
- Action explanation traces

---

## `src/simulation/variables`

Owns:

- Namespaced variable definitions
- Variable registry ordering
- Variable metadata
- Bounded person-variable storage
- Variable initialization contracts

---

## `src/simulation/influences`

Owns:

- Sparse influence definitions
- Influence indexes
- Modifier evaluation
- Influence-edge metadata
- Influence traces

---

## `src/simulation/exposure`

Owns:

- Exposure accumulation
- Exposure windows
- Co-presence evidence
- Source-hour accounting
- Structured experiences

---

## `src/simulation/relationships`

Owns:

- Encounter resolution
- Relationship dimensions
- Relationship updates
- Relationship decay
- Social interaction evidence

---

## `src/simulation/development`

Owns:

- Plasticity
- Experience-driven development
- Development formulas
- Development traces
- Age-dependent developmental effects

---

## `src/simulation/community`

Owns:

- Geographic catchments
- Evidence aggregation
- Emergent social measures
- Structural conditions
- Community feedback
- Contributor traces

---

## `src/projection` or projection-related modules

Owns:

- Non-authoritative viewport projections
- Level-of-detail aggregation
- Marker budgets
- Bounded inspection summaries
- Projection spatial indexes
- Regional summaries
- Draft-world preview projections where appropriate

Projection state must not affect canonical simulation output.

---

## `src/worker`

Owns:

- Simulation engine execution
- Authoritative engine ownership
- Typed commands
- Simulation advancement
- Projection transport
- Draft-world ownership
- Worker continuation behavior

---

## `src/persistence`

Owns:

- Snapshots
- Imports
- Exports
- Validation
- Migrations
- Meaningful events
- Sampled statistics
- Serialized draft formats where appropriate

---

## `src/ui` and `src/App.tsx`

Owns:

- Visualization
- Controls
- Inspectors
- Map interaction
- Overlays
- Diagnostics
- Draft authoring UI

UI code must not bypass owning simulation systems.

---

# Current Development Priority

`ROADMAP.md` is the authoritative source for milestone status and planned sequencing.

When the user supplies a specific change request:

- The requested change takes priority.
- Do not redirect the task to the next roadmap milestone.
- Use `ROADMAP.md` to understand surrounding scope, prerequisites, and deferred systems.
- Implement only the support necessary to complete the requested behavior.

When the user asks to continue development without naming a feature:

- Identify the next unfinished roadmap slice.
- Prefer the smallest independently reviewable vertical slice.
- Do not skip ahead to later milestones without a concrete dependency or explicit user direction.

Do not opportunistically implement future roadmap systems.

---

# Agent Strategy

The primary development session is expected to use:

```text
GPT-5.6 Terra
Reasoning: Medium
```

The primary agent owns:

- Understanding the user's request
- Scope control
- Integration
- Implementation strategy
- Engineering judgment
- Final completion decision

Use subagents selectively.

Do not create agents simply because agents are available.

Delegation should reduce cost, context usage, or task complexity.

---

# Available Custom Agents

## `explorer`

Expected configuration:

```text
GPT-5.6 Luna
Reasoning: Low
```

Use for:

- Locating relevant files
- Finding symbols
- Tracing code paths
- Finding callers and consumers
- Finding existing implementation patterns
- Finding relevant tests
- Dependency exploration
- Determining affected subsystems
- Inspecting repository configuration

Prefer `explorer` for non-trivial read-heavy repository investigation.

The explorer should return concise findings rather than large file dumps.

Do not use `explorer` for implementation.

---

## `tester`

Expected configuration:

```text
GPT-5.6 Luna
Reasoning: Medium
```

Use for:

- Running targeted tests
- Reproducibility validation
- Type checking
- Build validation
- Lint validation
- Straightforward test-failure investigation
- Finding missing test coverage
- Running controlled validation scenarios

Prefer `tester` for routine validation rather than spending primary-agent reasoning on test execution.

---

## `worker`

Expected configuration:

```text
GPT-5.6 Terra
Reasoning: Medium
```

Use for clearly separable implementation work.

Good uses include:

- Independent frontend and backend portions
- Independent worker and UI implementation
- Separate simulation subsystems with stable interfaces
- Well-bounded migrations
- Large mechanical implementations that still require engineering judgment

Do not spawn `worker` when the primary Terra agent can efficiently implement the change directly.

Avoid multiple agents modifying the same files concurrently.

---

## `reviewer`

Expected configuration:

```text
GPT-5.6 Terra
Reasoning: High
```

Use for independent review of substantial or high-risk changes.

Examples:

- Simulation-rule changes
- RNG changes
- Snapshot/schema changes
- Persistent-state changes
- World-generation changes
- Major worker-protocol changes
- Cross-cutting features
- Large refactors
- Data-integrity-sensitive changes

The reviewer should focus on:

- Correctness
- Missing requirements
- Regressions
- Determinism
- RNG ownership
- Serialization compatibility
- Data integrity
- Architecture violations
- Edge cases
- Missing tests

Small changes do not automatically require an independent reviewer.

---

## `architect`

Expected configuration:

```text
GPT-5.6 Sol
Reasoning: High
```

`architect` is an escalation resource.

Use only when:

- A major architectural decision has significant long-term consequences.
- Several approaches have materially different tradeoffs.
- A difficult deterministic, concurrency, or worker-boundary problem remains unresolved.
- Serialization or data-integrity correctness remains unclear.
- Terra has made reasonable attempts without reaching a reliable solution.
- The change presents unusually high technical risk.

Prefer asking `architect` to:

```text
Analyze the problem and recommend an implementation strategy.
```

rather than:

```text
Implement the entire feature.
```

Terra should normally perform the implementation after receiving the architectural recommendation.

Do not use Sol for:

- Repository exploration
- Routine implementation
- Tests
- Documentation
- Formatting
- Mechanical refactoring
- Straightforward debugging
- Additional reassurance

---

# Delegation Rules

Before spawning an agent, determine:

1. Is the task clearly bounded?
2. Does delegation avoid loading significant unnecessary context into the parent?
3. Can the result be returned concisely?
4. Can the agent work without conflicting with another active agent?
5. Is delegation cheaper or more efficient than doing the work directly?

If not, perform the work directly.

Prefer:

```text
Primary Terra
├── Luna explorer
└── Luna tester
```

over a large agent swarm.

Parallelize only genuinely independent tasks.

Do not spawn several agents to solve the same problem unless competing analyses are explicitly useful.

Do not recursively create unnecessary agent trees.

---

# Context Efficiency

Protect the primary Terra context.

Do not automatically read the entire repository.

Before implementation:

1. Inspect `git status`.
2. Understand the user's request.
3. Read the relevant portion of `README.md`.
4. Read the relevant roadmap section only when planning or scope context matters.
5. Read the detailed trait/influence design only when the change touches that system.
6. Search for affected implementation.
7. Inspect nearby tests.

Use `explorer` when repository discovery is non-trivial.

Search before opening large files.

Avoid repeatedly reading files already understood.

Subagents should summarize:

- Relevant filenames
- Important symbols
- Existing conventions
- Dependencies
- Risks
- Recommended next steps

Do not return large raw command output unless directly necessary.

---

# Change Classification

Before implementation, determine whether the change affects authoritative simulation behavior.

A change is simulation-affecting if it changes any of the following:

- Simulation rules
- Tick ordering
- Opportunity generation
- Action evaluation
- Random draws
- RNG stream ownership
- Coefficients
- Fixed-point calculations
- Units
- Authoritative state
- Serialization
- Snapshot restoration
- World generation
- Registry ordering
- Canonical digest output

For simulation-affecting changes, explicitly determine whether the following must change:

- `ENGINE_VERSION`
- `SNAPSHOT_SCHEMA_VERSION`
- World-generator version
- Variable-registry version
- Influence-registry version
- Household-model version
- Activity-registry version
- Development-registry version
- Community-registry version
- Other versioned subsystem contracts
- Canonical digest fixtures

Do not automatically increment versions.

Increment only when the corresponding compatibility or behavioral contract changes.

---

# Implementation Workflow

## 1. Understand

Determine:

- Requested behavior
- Existing behavior
- Smallest complete implementation
- Affected architectural boundaries
- Whether authoritative simulation output changes
- Whether serialization compatibility changes

Do not broaden the task unnecessarily.

---

## 2. Explore

Inspect:

- Relevant implementation
- Existing patterns
- Tests
- Interfaces
- Versioned contracts
- Persistence boundaries if applicable

Delegate substantial repository exploration to `explorer`.

---

## 3. Plan

For non-trivial work, establish a concise implementation plan.

Prefer a vertical slice:

```text
domain/configuration
  -> simulation behavior
  -> worker/persistence if required
  -> projection/UI inspection if required
  -> tests
```

Do not produce elaborate plans for trivial changes.

---

## 4. Implement

Prefer:

- Pure functions
- Explicit inputs
- Stable ordering
- Deterministic tie-breaking
- Typed identifiers
- Fixed-point arithmetic where authoritative behavior requires it
- Named configuration
- Explicit units
- Versioned registries where appropriate

Put meaningful coefficients into:

- Registries
- Named configuration
- Versioned model definitions

Do not scatter unexplained constants throughout simulation code.

Do not let unrelated modules directly mutate owned simulation values.

---

## 5. Add Observability

Important behavior should be inspectable through the application where practical.

Prefer:

- Structured events
- Structured traces
- Metrics
- Sampled statistics
- Inspector data
- Diagnostic projections

Do not rely only on console logging.

---

## 6. Validate

Run targeted validation during implementation.

Escalate validation according to risk.

---

## 7. Review

Inspect the complete final diff.

Use `reviewer` when independent review provides meaningful value.

Fix substantive findings before completion.

---

## 8. Document

Update documentation according to responsibility:

- Implemented architecture or current system boundaries → `README.md`
- Milestone status, sequencing, future scope, or deferred work → `ROADMAP.md`
- Trait, influence, exposure, development, or community model semantics → relevant design document
- Simulation formulas or contracts → relevant canonical technical documentation
- Version/persistence contracts → all affected references

Do not duplicate detailed roadmap content in `AGENTS.md`.

---

# Testing Strategy

Testing should be proportional to the change.

## During Development

Run the smallest useful validation first.

Examples:

```powershell
pnpm vitest <relevant-test>
```

or the equivalent targeted Vitest invocation supported by the project.

Prefer targeted tests while iterating.

Do not repeatedly run the entire test and E2E suite for every small edit.

---

# Validation Levels

## Level 1 — Local or Mechanical Change

Examples:

- Documentation
- Labels
- Styling
- Isolated presentational UI changes
- Mechanical refactors that cannot affect simulation output

Typical validation:

```powershell
pnpm typecheck
```

Add directly relevant tests when available.

Run:

```powershell
pnpm build
```

when bundling or compilation behavior may be affected.

Do not automatically run the complete Playwright suite.

---

## Level 2 — Application Behavior Change

Examples:

- UI interactions
- Projection behavior
- Worker command handling
- Persistence UI
- Draft-map interaction
- Non-authoritative application logic

Typical validation:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Run targeted Playwright tests for affected workflows.

---

## Level 3 — Simulation Contract Change

Examples:

- Simulation rules
- RNG behavior
- Tick ordering
- Variables
- Influences
- Activities
- Relationships
- Exposure
- Development
- Community calculations
- World generation
- Serialization
- Snapshot behavior

Required validation generally includes:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Also run:

- Relevant deterministic regression tests
- Controlled scenario tests
- Statistical tests where probabilistic tendency changed
- Snapshot compatibility tests when persistence is affected
- Relevant E2E flows

Run the complete E2E suite when the change has broad application impact.

---

## Level 4 — Milestone or Release Validation

For milestone completion, major integration work, or broad system changes run:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Do not repeatedly run the entire suite while iterating unless necessary.

---

# Simulation Test Expectations

Add tests proportional to changed semantics.

## Exact Unit Tests

Use for:

- Formulas
- Fixed-point arithmetic
- Bounds
- Curves
- Availability
- Utility components
- Action execution
- Deterministic transforms

---

## Fixed-Seed Regression Tests

Use when exact seeded output forms part of the reproducibility contract.

Update fixtures deliberately.

Never regenerate canonical fixtures simply to make tests pass without understanding the behavioral change.

---

## Controlled Scenario Tests

Construct scenarios where one causal factor differs and unrelated factors remain controlled.

Use these to verify causal behavior.

---

## Statistical Multi-Seed Tests

Use for probabilistic tendencies.

Do not claim a probabilistic tendency based on a single seed.

Statistical tests should generally verify robust directional behavior rather than fragile exact distributions unless the distribution itself is contractual.

---

## Invariant Tests

Verify properties such as:

- Legal bounds
- Valid probabilities
- Location uniqueness
- Resource conservation
- Impossible actions remain impossible
- Stable identifiers
- Valid references
- Registry consistency
- Catchment invariants
- Household invariants
- Spatial invariants

---

## Persistence Tests

When persisted state changes, test:

- Snapshot round trip
- Validation
- Schema compatibility
- Explicit migration or rejection
- RNG restoration
- Version compatibility
- Canonical digest behavior

---

## UI and End-to-End Tests

Use Playwright for important workbench flows.

Cross-browser coverage is especially important for:

- Persistence
- Worker behavior
- Rendering
- World creation
- Draft authoring
- Simulation controls
- Reproducibility-sensitive browser interactions

---

# Reproducibility Checklist

For every simulation-affecting change:

- Determine whether canonical engine output changes.
- Determine whether RNG draw count changes.
- Determine whether RNG draw ordering changes.
- Determine whether named RNG stream ownership changes.
- Verify RNG state survives snapshot restoration.
- Determine whether canonical digests must change.
- Determine whether engine or schema versions must change.
- Determine whether registry/model versions must change.
- Verify deterministic collection ordering.
- Verify deterministic tie-breaking.
- Verify fixed-point conversion.
- Verify rounding semantics.
- Ensure explanation traces describe the new calculation.
- Ensure incompatible snapshots are explicitly migrated or rejected.

Never silently accept incompatible serialized state.

---

# Performance Expectations

The simulator should eventually support significantly larger worlds and populations, but optimization should be driven by measured constraints rather than speculative future scale.

For current validation worlds:

- Avoid global O(N²) agent interaction.
- Prefer spatial indexes and bounded queries.
- Keep viewport projections bounded.
- Keep simulation fidelity independent from rendering fidelity.
- Avoid transferring authoritative world-scale arrays when projections suffice.
- Preserve responsive worker execution.
- Avoid unnecessary per-tick allocations in hot paths where measurable.

When performance work is requested:

1. Measure.
2. Identify the actual bottleneck.
3. Optimize that bottleneck.
4. Verify reproducibility remains intact.
5. Add regression coverage where appropriate.

---

# UI and Map Expectations

The map architecture must remain capable of representing extremely large worlds.

Maintain these principles:

- Hex outlines are a local-detail representation.
- Reduce or remove outlines as the camera zooms out.
- Aggregate people, resources, statistics, events, and boundaries according to level of detail.
- Person markers remain bounded in screen space.
- Markers should cluster, aggregate, or disappear when individual representation becomes inappropriate.
- Hooked people remain inspectable as they move.
- Hooking a person does not automatically move the camera.
- Simulation fidelity and rendering fidelity remain independent.
- Draft edits must not mutate a running authoritative world before explicit commit.

Preserve important diagnostics such as:

- Seed
- Tick/date
- Simulation speed
- Events
- Metrics
- Cell inspection
- Person history
- Decision explanations
- Development traces
- Community traces
- World-generation information

---

# Scope Control

Implement the requested feature and whatever support is necessary to make it complete.

Do not automatically expand the task into:

- Broad refactors
- Framework replacements
- Dependency migrations
- New simulation systems
- Future roadmap milestones
- Performance redesign
- General architectural cleanup

If a larger improvement would be useful but is not required, mention it after completing the requested work rather than implementing it automatically.

---

# Git Safety

Before significant edits:

```powershell
git status
```

Treat existing modifications as intentional user work.

Do not:

- Discard unrelated changes
- Reset files
- Force checkout files over modifications
- Rewrite history
- Force push
- Commit unless requested
- Push unless requested

Keep modifications scoped to the requested work.

---

# User Interaction

Prefer resolving engineering details from:

- The user's request
- Existing architecture
- Existing conventions
- Tests
- Canonical documentation

Do not repeatedly ask questions that can safely be resolved from the repository.

Ask only when a decision:

- Cannot reasonably be inferred
- Materially changes product behavior
- Has multiple significantly different valid outcomes
- Requires information unavailable in the repository

For minor and reversible uncertainty, follow the closest existing convention and continue.

If the user requests planning only, do not implement.

The user's explicit current instructions override roadmap priority and general guidance in this file.

---

# Definition of Done

A change is complete when:

- Requested behavior is implemented.
- Necessary supporting changes are included.
- Architectural ownership remains correct.
- Authoritative simulation ownership remains outside the UI.
- Relevant behavior is inspectable where appropriate.
- Required tests are added or updated.
- Validation proportional to the change passes.
- Reproducibility remains intact or an intentional versioned contract change has been made.
- Persistence compatibility is explicit.
- The final diff has been reviewed.
- No known regression caused by the change remains.
- No unnecessary unrelated changes are included.
- Documentation reflects meaningful changes.
- Deferred systems remain deferred unless explicitly requested.

If the proposed change is too large to satisfy these criteria independently, divide it into smaller vertical slices.

---

# Final Handoff

Keep the final report concise.

Include:

- What changed
- Important implementation decisions
- Tests and validation performed
- Engine/schema/model/version changes, if any
- Migration impact, if any
- Known limitations or pre-existing failures
- What intentionally remains deferred

Do not narrate routine repository exploration or every command executed.