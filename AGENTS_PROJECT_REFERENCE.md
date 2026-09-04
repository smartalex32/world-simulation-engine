# World Simulation Engine — Project Reference

## Purpose

The World Simulation Engine is an explainable, reproducible, spatial, stochastic agent-based simulation.

Its core feedback loop is:

```text
geography and environment
  -> individual exposure and experience
  -> probabilistic behavior and development
  -> social interaction
  -> emergent community conditions
  -> new exposure for current and future people
```

The simulation should support observing both individual behavior and larger emergent societal patterns over time.

## Canonical Project Sources

Use project documentation according to its responsibility:

* `README.md` — current architecture, runtime model, and system boundaries.
* `docs/ROADMAP.md` — planned capabilities, sequencing, milestone status, and deferred scope.
* `docs/TRAIT_AND_INFLUENCE_SYSTEM.md` — person variables, influences, exposure, development, and community-feedback semantics.
* Tests and serialized fixtures — reproducibility and compatibility contracts.

Do not assume roadmap features are already implemented.

When documentation and implementation disagree, determine the currently supported behavior and update stale documentation as part of the relevant change.

---

## Core Simulation Contracts

### No Generative AI in Authoritative Simulation

Simulation behavior must remain computational and model-driven.

Do not introduce LLM calls, generated agent decisions, external AI dependencies, or AI-generated authoritative state.

AI may assist development or analyze simulation output, but it must not determine canonical simulation outcomes.

### Reproducibility

Identical versioned inputs and seeds must produce identical canonical simulation output.

Authoritative results must not depend on:

* Wall-clock time
* Browser or rendering timing
* Worker scheduling
* Machine performance

### Randomness

All authoritative randomness must come from named, seeded, snapshot-restorable RNG streams.

Never use `Math.random()` or other untracked randomness for simulation behavior.

Random draws must have explicit ownership. Changes to draw count, order, or ownership can change canonical simulation output and must be treated deliberately.

### Explainability

Important simulation outcomes should be inspectable.

Where applicable, retain structured information describing:

* Inputs and base values
* Contributing factors and modifiers
* Probability
* Random result
* Selected outcome
* Resulting state change
* Relevant rounding or clamping

Prefer structured traces or events over formatted explanation strings.

### Semantic Separation

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

Shared infrastructure is acceptable, but ownership and meaning must remain explicit.

### Exposure Drives Influence

Influence should generally result from what a person actually experiences:

* Where they spend time
* Who they encounter
* What happens to them
* The strength and persistence of those exposures

Do not automatically transfer characteristics from communities, households, settlements, organizations, or political units to individuals merely because they belong to them.

### Sparse Influence Relationships

Model meaningful influences explicitly using typed, sparse relationships.

Do not build complete pairwise matrices between every possible variable.

---

## Architecture Contracts

The `README.md` defines the current architecture. Preserve its established subsystem boundaries.

In particular:

* Authoritative simulation state remains outside the UI.
* The worker owns authoritative simulation execution and draft-world mutation.
* The UI sends commands and displays projections; it does not directly mutate authoritative state.
* RNG behavior belongs to the RNG subsystem.
* Domain state should be modified through its owning subsystem.
* Persistence owns snapshot/import/export validation and migration behavior.
* Projection and rendering state are non-authoritative.
* Rendering behavior must never affect canonical simulation results.

Do not bypass subsystem ownership simply because direct mutation is easier.

---

## Persistence and Versioning

Serialized simulation state is part of the simulation contract.

Preserve:

* Explicit schema versions
* Engine/model versions where applicable
* Stable ordering
* Explicit units
* Validation boundaries
* RNG state required for deterministic continuation
* Explicit migration or rejection behavior

Never silently reinterpret incompatible serialized state.

When authoritative simulation behavior changes, determine whether the change affects:

* Engine version
* Snapshot schema version
* World-generator version
* Registry/model versions
* Canonical digest fixtures

Do not increment versions automatically. Change them only when the corresponding behavioral or compatibility contract changes.

---

## Simulation Change Validation

Changes affecting authoritative simulation behavior require additional scrutiny.

This includes changes to:

* Simulation rules
* Tick ordering
* Opportunity or action evaluation
* RNG draws or ownership
* Coefficients or units
* Authoritative state
* World generation
* Serialization or restoration
* Registry ordering
* Canonical digests

Use appropriate combinations of:

* Exact unit tests for deterministic formulas
* Fixed-seed regression tests for reproducibility
* Controlled scenarios for causal behavior
* Multi-seed statistical tests for probabilistic tendencies
* Invariant tests for legal state
* Persistence round-trip and compatibility tests

Do not infer probabilistic behavior from a single seed.

Do not update deterministic fixtures merely because output changed. First determine why the canonical output changed and whether that change is intentional.

For simulation-affecting changes, verify as applicable:

* RNG draw count, order, and ownership
* Snapshot-restored RNG state
* Stable ordering and deterministic tie-breaking
* Units, fixed-point conversions, and rounding
* Canonical digest changes
* Version/schema impact
* Explanation trace correctness
* Migration or rejection of incompatible state

---

## Performance Principles

The simulation may eventually support large populations, worlds, and time spans, but scaling should remain evidence-driven.

* Avoid global O(N²) agent interaction when bounded or indexed approaches are practical.
* Prefer spatial indexes and bounded queries.
* Keep viewport projections bounded.
* Keep rendering fidelity separate from simulation fidelity.
* Avoid transferring authoritative world-scale state when projections suffice.
* Keep worker execution responsive.

Measure before introducing significant performance architecture.

Do not build speculative scaling infrastructure for requirements that do not yet exist.

---

## Product Scope

Build toward the simulation described by the roadmap, but do not assume future systems are current requirements.

Potential future areas such as:

* Politics
* Warfare
* Religion
* Language
* Detailed economics
* Technology
* Disease
* Genetics
* Narrative generation
* Massive population/cohort simulation

should not drive current architecture beyond reasonable extension points unless an active requirement needs them.

When the user requests a feature, that request takes priority over roadmap sequencing. Implement the support necessary to make the requested feature complete without automatically implementing adjacent roadmap systems.

When asked to continue development without a specific feature, use `docs/ROADMAP.md` to identify the next unfinished milestone or logical unit of work.

---

## Documentation Ownership

Keep information in its appropriate location:

* Current architecture and system boundaries → `README.md`
* Planned work and milestone status → `docs/ROADMAP.md`
* Detailed simulation semantics → relevant design documents
* Reproducibility and compatibility contracts → tests, fixtures, and relevant technical documentation
* Generic agent behavior → `AGENTS.md`

Avoid duplicating detailed information across these files.

When implementation changes one of these contracts, update its owning documentation in the same change.
