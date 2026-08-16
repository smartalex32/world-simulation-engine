# World Simulation Engine

A spatial, stochastic, agent-based world simulator focused on explainable behavior, reproducible execution, and emergent social conditions.

The project models a world from individual behavior upward:

```text
geography and environment
  -> individual exposure and experience
  -> probabilistic behavior and development
  -> social interaction
  -> emergent community conditions
  -> new exposure for current and future people
```

The simulation is intentionally developed through small vertical slices. Current systems focus on deterministic execution, spatial behavior, individual decisions, relationships, household activity, developmental exposure, community feedback, scalable visualization, and reproducible world creation.

Generative AI is not part of authoritative simulation behavior.

---

# Current Status

Implemented milestones:

- Milestone 0 — Deterministic Simulation Core
- Milestone 1 — Spatial World and Movement
- Milestone 2 — Agent Decisions and Actions
- Milestone 3 — Social Encounters and Relationships
- Milestone 4 — Variable, Trait, and Influence Registries
- Milestone 5A — Activities and Household Topology
- Milestone 5B — Exposure, Experiences, and Development
- Milestone 6 — Emergent Community Feedback
- Milestone 7 — Large-World Rendering and Simulation Scale
- Milestone 8A — Reproducible World Creation

Current next milestone:

- Milestone 8B — Draft Map Authoring

See `ROADMAP.md` for planned sequencing and future systems.

---

# Technology Stack

## Frontend

- React 19
- TypeScript
- Vite

## Simulation Runtime

- DOM-free TypeScript simulation engine
- Dedicated Web Worker ownership
- Fixed one-hour base simulation ticks
- Seeded PCG32 random streams
- Integer/fixed-point authoritative calculations where appropriate

## Persistence

- IndexedDB
- Versioned snapshot schemas
- Versioned simulation/model contracts
- Import/export support
- Explicit compatibility validation

## Testing

- Vitest
- Playwright
- Chromium
- Firefox
- WebKit

---

# Repository Structure

The exact internal structure may evolve, but the major architectural responsibilities are:

```text
src/
├── simulation/
│   ├── domain/
│   ├── rng/
│   ├── spatial/
│   ├── agents/
│   ├── variables/
│   ├── influences/
│   ├── exposure/
│   ├── relationships/
│   ├── development/
│   └── community/
├── worker/
├── persistence/
├── ui/
├── projection/
└── App.tsx

docs/
└── TRAIT_AND_INFLUENCE_SYSTEM.md

AGENTS.md
README.md
ROADMAP.md
```

Some projection functionality may currently live near UI or worker code while boundaries continue to mature.

---

# Architectural Model

The simulator separates authoritative state from presentation.

```text
UI
 │
 │ commands / viewport requests
 ▼
Worker
 │
 │ owns
 ▼
Simulation Engine
 │
 ├── authoritative world state
 ├── RNG streams
 ├── people
 ├── relationships
 ├── households
 ├── activities
 ├── variables
 ├── exposures
 ├── development
 └── community conditions

Worker
 │
 │ bounded projections
 ▼
UI
```

The UI never directly mutates authoritative simulation state.

Rendering and simulation fidelity are separate concerns.

---

# Reproducibility Model

The simulation is designed so that identical inputs produce identical canonical results.

A run is defined by inputs including:

- Initial state
- User configuration
- Seed
- Engine version
- Snapshot schema version
- World-generator version
- Registry/model versions

Simulation randomness is centralized into named seeded RNG streams.

Authoritative simulation code must not use:

```ts
Math.random()
```

or wall-clock time to determine outcomes.

RNG state is serialized where required so loading a snapshot can continue the same simulation sequence.

---

# Canonical State

Authoritative simulation state includes the state necessary to continue the simulation reproducibly.

Examples include:

- World state
- People
- Person variables
- Household topology
- Activity state
- Relationships
- Exposure windows
- Development state
- Community state
- RNG state
- Engine/model version information

Presentation-only state is intentionally excluded from canonical simulation output.

Examples include:

- Camera position
- Viewport cache
- Level-of-detail selections
- Render throttling state
- Marker layout
- UI selections that do not affect simulation behavior

Canonical state digests are used to verify deterministic behavior.

---

# Time Model

The base simulation cadence is one hour per tick.

Higher-level systems may operate at larger deterministic intervals.

Examples include:

- Hourly needs and activity behavior
- Encounter behavior driven by co-location
- Exposure accumulation across hours
- Multi-day or monthly exposure windows
- Daily community aggregation
- Age-dependent development

Higher-level cadence must derive from simulation ticks rather than wall-clock time.

---

# Spatial World

The world uses hex-based spatial geography.

Current capabilities include:

- Axial coordinates
- Passability
- Neighborhood queries
- Spatial distance
- Activity locations
- Household homes
- Settlements
- Geographic community catchments
- World-scale projections
- Level-of-detail aggregation

The authoritative world remains spatial even when the UI renders aggregated regions.

---

# People and Variables

Person state uses typed, namespaced variables.

The initial trait registry includes:

- Curiosity
- Risk tolerance
- Sociability
- Trust propensity
- Conformity
- Persistence

Short-term state includes:

- Hunger
- Fatigue

Needs include:

- Social connection

These categories remain semantically distinct even when they use related registry/storage infrastructure.

Values are represented with bounded integer permille units where applicable.

---

# Influence System

Behavioral and developmental effects use a sparse influence graph.

Influences are modeled as explicit typed edges rather than an all-to-all trait matrix.

An influence edge can define relationships such as:

```text
person.trait.curiosity
    -> exploration action utility
```

or:

```text
community.innovationClimate
    -> exploration opportunity utility
```

The influence system preserves metadata used for explanation traces.

See:

```text
docs/TRAIT_AND_INFLUENCE_SYSTEM.md
```

for the detailed target model.

---

# Agent Decisions

People are presented with context-dependent action opportunities.

The general decision pipeline is:

```text
current person state
  + location/context
  + available opportunities
  + relationships
  + sparse influences
  -> action utility
  -> probability
  -> seeded selection
  -> execution
```

Probabilistic behavior remains reproducible because all random selection uses named deterministic RNG streams.

Important action evaluations preserve structured explanation data.

---

# Relationships and Encounters

Social encounters are derived from spatial co-location rather than global pairwise comparison.

Relationship dimensions may include:

- Familiarity
- Interaction frequency
- Affection
- Trust
- Respect
- Fear

These dimensions remain independent rather than being compressed into one generic relationship score.

Relationship state can influence future interactions.

Encounter processing is spatially bounded to avoid global O(N²) comparisons.

---

# Households

Household topology is modeled independently from social relationship state.

Current household behavior includes:

- Household membership
- Parent-child links
- Home locations
- Adult and child roles
- Variable household generation
- Activity schedules

A parent-child relationship in household topology is not automatically equivalent to social affection, trust, or another relationship dimension.

---

# Activities

People follow versioned activity patterns that can place them at:

- Home
- Commons/activity locations
- Travel states
- Other supported locations

Activity determines where people physically spend time and therefore affects:

- Encounters
- Exposure
- Needs
- Statistics
- Future behavior

Physical co-presence is preferred over abstract membership when determining social exposure.

---

# Exposure and Experience

The first implemented developmental exposure model concerns parent-child curiosity modeling.

Exposure depends on actual qualifying co-presence.

The current mechanism tracks evidence such as:

- Recipient exposure hours
- Source hours
- Weighted source values
- Source identifiers

Completed exposure windows produce structured experiences.

Experiences are distinct from permanent person traits.

---

# Development

Structured experiences can produce deterministic developmental changes.

The first implemented developmental relationship is:

```text
parent curiosity exposure
  -> curiosity development
```

Development accounts for:

- Current value
- Source value
- Exposure strength
- Age-dependent plasticity
- Fixed-point rounding
- Value bounds

Development itself currently requires no random draw.

Changes preserve structured explanation traces.

This model is fictional simulation behavior and should not be interpreted as a biological claim.

---

# Emergent Communities

Communities are currently represented through geographic catchments rather than person membership fields.

People contribute evidence according to their actual location and behavior.

Current emergent measures include:

- Social trust
- Cohesion
- Cooperation
- Conflict
- Innovation climate

Structural conditions such as food security remain semantically separate.

Community measures are derived from observed simulation evidence and can influence future opportunities.

This creates a macro-to-micro feedback loop:

```text
individual behavior
  -> daily community evidence
  -> emergent community conditions
  -> future action opportunities
```

The current conflict measure is a simulation proxy and is not equivalent to warfare.

---

# World Rendering and Projection

The simulation and renderer use separate fidelity models.

The worker provides bounded projections appropriate to the current viewport.

Current projection behavior includes:

- Exact local cells
- Regional aggregation
- World-level aggregation
- Bounded population markers
- Bounded activity markers
- Bounded household markers
- Selected-person relationship segments
- Hooked-person summaries
- Settlement summaries
- Population-zone summaries

The UI does not require the complete authoritative world to render a world-scale view.

---

# Level of Detail

At close zoom:

- Individual cells can be shown.
- Hex outlines can be visible.
- Individual markers can be rendered.

At larger scales:

- Cells aggregate into regions.
- Hex outlines disappear.
- People aggregate.
- Markers remain bounded in screen space.
- Counts and statistics remain preserved.

Rendering fidelity does not change simulation fidelity.

---

# Hooked Person Behavior

A user may hook or select a person for continued inspection.

A hooked person:

- Remains highlighted when visible
- Continues updating in the inspector
- Can report offscreen state
- Does not automatically move the camera

Hooking is an inspection feature, not simulation state.

---

# Worker Execution

The worker owns authoritative simulation advancement.

Execution is structured so that long logical advances can yield periodically rather than blocking UI responsiveness.

Render frames and simulation advancement are independently managed.

Worker scheduling differences must not change canonical simulation outcomes.

Any worker continuation state that affects resuming an interrupted logical request must preserve deterministic behavior without contaminating canonical world semantics unnecessarily.

---

# Persistence

Snapshots preserve the state necessary to continue the simulation.

Persistence contracts are explicit and versioned.

When a snapshot format changes, the project must either:

- Provide an explicit tested migration, or
- Explicitly reject unsupported schemas

Unsupported old formats must never be silently misread.

---

# World Creation

World creation uses a versioned deterministic creation request.

Current configuration includes concepts such as:

- World name
- Seed
- Dimensions
- Physical scale
- Initial population
- Settlements
- Population-placement zones

Terrain generation occurs deterministically from the supplied seed.

Population placement is resolved after terrain generation so UI presets do not guess passability.

Household generation remains reproducible.

Settlements currently represent named geographic places only.

They do not imply:

- Government
- Political control
- Culture
- Economy
- Community membership

---

# Current World-Generation Bounds

The currently implemented world generator supports bounded dense authoritative worlds intended for validation rather than final maximum scale.

The implementation currently supports configurable worlds within defined limits such as:

- Bounded cells per axis
- Bounded dense authoritative cell count
- Fixed physical hex scale
- Bounded initial population

Exact limits should be read from the implementation rather than duplicated as permanent product guarantees.

The projection architecture is designed to support much larger represented worlds than the current dense authoritative storage model.

---

# Current Scaling Boundaries

Large-world rendering is substantially more scalable than authoritative simulation storage.

Known areas for later scaling work include:

- Dense-grid authoritative storage
- Very large populations
- Population paging
- Cohort simulation
- Chunked world state
- Dirty-region updates
- Background aggregation
- OffscreenCanvas
- Parallel simulation strategies

These are intentionally deferred until measurements justify them.

---

# Draft Map Authoring

The next roadmap milestone introduces a worker-owned draft world.

The intended ownership model is:

```text
UI editing tools
  -> worker command
  -> draft world mutation
  -> preview projection
  -> validation
  -> explicit commit
  -> authoritative world
```

Draft state must not silently modify a running authoritative simulation.

See `ROADMAP.md` for incremental slices.

---

# Diagnostics and Explainability

The workbench should treat diagnostics as first-class product features.

Important inspectable data includes:

- Seed
- Current tick/date
- Simulation speed
- Person variables
- Needs/states
- Current activity
- Household information
- Relationships
- Action explanations
- Experience traces
- Development traces
- Community measures
- Community contributor traces
- Meaningful events
- Sampled metrics
- Cell data
- World-generation data

The simulator should make it possible to understand why an observed outcome occurred.

---

# Testing Philosophy

The simulation uses several complementary test types.

## Unit Tests

For exact deterministic logic such as:

- Fixed-point formulas
- Bounds
- Curves
- Utility calculations
- Spatial calculations
- Availability conditions

## Fixed-Seed Regression Tests

For reproducibility-sensitive behavior.

## Controlled Scenario Tests

For isolating causal effects.

## Statistical Multi-Seed Tests

For validating probabilistic tendencies.

A probabilistic tendency must not be inferred from one seed.

## Invariant Tests

For system rules such as:

- Valid probability ranges
- Variable bounds
- Stable identifiers
- Valid relationships
- Unique locations where required
- Conservation rules
- Impossible actions

## Persistence Tests

For:

- Snapshot round trips
- Schema validation
- Version compatibility
- Migration/rejection
- RNG restoration

## End-to-End Tests

For important UI, worker, persistence, and simulation workflows across supported browsers.

---

# Validation Commands

Common validation commands include:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

During normal development, targeted validation should be used while iterating.

The complete validation suite is expected for major milestone or release-level work.

See `AGENTS.md` for risk-based validation guidance.

---

# Development Rules

Before changing simulation behavior:

- Determine whether canonical output changes.
- Determine whether RNG draw ordering changes.
- Determine whether persistence changes.
- Determine whether version increments are necessary.
- Update explanation traces.
- Add appropriate tests.

Avoid broad architectural refactors unless required by the current vertical slice.

---

# Versioning

The project uses explicit versioned contracts for systems such as:

- Engine behavior
- Snapshot schema
- World generation
- Variable registries
- Influence registries
- Household models
- Activity registries
- Development registries
- Community registries

Current numeric versions should be obtained from source rather than treated as permanent documentation constants.

A version should change only when its corresponding contract changes.

---

# Non-Goals of the Current Implementation

The current simulator does not attempt to fully model:

- Politics
- Government
- Warfare
- Religion
- Language
- Detailed economics
- Financial systems
- Technology trees
- Genetics
- Detailed disease
- Full ecology
- Narrative generation
- Multiplayer
- Collaborative editing
- Massive cohort simulation

Some of these may become future milestones.

See `ROADMAP.md`.

---

# Documentation

The project documentation is divided by purpose:

## `README.md`

Describes what the system currently is.

## `ROADMAP.md`

Describes where the system is going.

## `AGENTS.md`

Defines how Codex and development agents should work in the repository.

## `docs/TRAIT_AND_INFLUENCE_SYSTEM.md`

Defines detailed target semantics for person variables, influences, exposure, development, and related feedback mechanisms.

Tests and serialized fixtures provide the executable behavioral contract.

---

# Getting Started

Install dependencies:

```powershell
pnpm install
```

Run the development server:

```powershell
pnpm dev
```

Run unit and regression tests:

```powershell
pnpm test
```

Run type checking:

```powershell
pnpm typecheck
```

Build the application:

```powershell
pnpm build
```

Run end-to-end tests:

```powershell
pnpm test:e2e
```

---

# Long-Term Direction

The intended long-term simulator is not a scripted story generator.

It is a system where complex outcomes can emerge from understandable lower-level mechanisms:

```text
world
  -> people
  -> behavior
  -> relationships
  -> households
  -> exposure
  -> development
  -> communities
  -> institutions
  -> societies
  -> history
```

Complexity should be earned incrementally.

Each new layer should be grounded in systems already capable of producing evidence for it.