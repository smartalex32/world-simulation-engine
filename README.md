# World Simulation Engine

A spatial, stochastic, agent-based world simulator focused on explainable behavior, reproducible execution, and emergent social conditions.

The simulation models a world from individual behavior upward:

```text
geography and environment
  -> individual exposure and experience
  -> probabilistic behavior and development
  -> social interaction
  -> emergent community conditions
  -> new exposure for current and future people
```

Development proceeds through small vertical slices. The long-term goal is a simulator capable of representing large worlds, long time spans, individual lives, and emergent societies while preserving reproducibility and causal inspection.

Generative AI is not part of authoritative simulation behavior.

---

# Current Status

Implemented:

* Milestone 0 — Deterministic Simulation Core
* Milestone 1 — Spatial World and Movement
* Milestone 2 — Agent Decisions and Actions
* Milestone 3 — Social Encounters and Relationships
* Milestone 4 — Variable, Trait, and Influence Registries
* Milestone 5A — Activities and Household Topology
* Milestone 5B — Exposure, Experiences, and Development
* Milestone 6 — Emergent Community Feedback
* Milestone 7 — Large-World Rendering and Simulation Scale
* Milestone 8A — Reproducible World Creation
* Milestone 8B.1 — Draft World Lifecycle
* Milestone 8B.2A — Preset Placement Zone Authoring
* Milestone 8B.2B — Direct Placement-Zone Drawing
* Milestone 8B.3 — Terrain Painting
* Milestone 8B.4 — Settlement Editing
* Milestone 8B.5 — Roads
* Milestone 8B.6 — Draft Import and Export
* Milestone 9A — Renewable Food Resources
* Milestone 9B — Deterministic Seasonal Environment
* Milestone 9C — Location-Based Environmental Exposure
* Milestone 10 — Life Cycle and Population Dynamics

Settlement editing is also available in the same draft workspace. Authors can add, remove, rename, and place named settlement anchors on passable cells. A settlement remains a geographic marker: it does not imply governance, culture, economy, or automatic community membership. Linked population zones retain their existing anchor-containment validation.

Draft roads are ordered, contiguous passable-cell segments. They are validated by the worker, serialize with authored worlds, and render on exact-cell map projections. Current agent movement is intentionally unchanged: route-aware road travel is deferred until a route-planned movement system exists.

Drafts can also be imported and exported as a versioned JSON bundle. Bundles include the draft record, generator version, dimensions, scale, seed, terrain/resource edits, population zones, settlements, and roads; incompatible versions are rejected rather than silently reinterpreted.

Next:

* Milestone 11 — Broader Human Development

See `docs/ROADMAP.md` for detailed sequencing, planned capabilities, and deferred systems.

---

# Technology Stack

## Application

* React 19
* TypeScript
* Vite

## Simulation

* DOM-free TypeScript simulation engine
* Dedicated Web Worker ownership
* Fixed one-hour base simulation ticks
* Seeded PCG32 random streams
* Integer/fixed-point authoritative calculations where appropriate

## Persistence

* IndexedDB
* Versioned snapshot schemas
* Versioned engine/model contracts
* Import/export support
* Explicit migration or rejection boundaries

## Testing

* Vitest
* Playwright
* Chromium
* Firefox
* WebKit

---

# Repository Structure

Major responsibilities are organized approximately as:

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
├── projection/
├── ui/
└── App.tsx

docs/
├── ROADMAP.md
└── TRAIT_AND_INFLUENCE_SYSTEM.md

AGENTS.md
README.md
```

Exact file placement may evolve, but subsystem ownership should remain explicit.

---

# Architecture at a Glance

The simulation separates authoritative state from presentation.

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
 ├── world
 ├── RNG
 ├── people
 ├── households
 ├── activities
 ├── relationships
 ├── variables
 ├── exposure
 ├── development
 └── community state

Worker
 │
 │ bounded projections
 ▼
UI
```

The UI does not directly mutate authoritative simulation state.

Rendering fidelity and simulation fidelity are independent.

---

# Subsystem Ownership

## Simulation Domain

Owns:

* Serializable authoritative state
* Typed identifiers
* Core domain structures
* Versioned state contracts

## RNG

Owns:

* Seeded streams
* Stream naming
* Deterministic selection
* Serializable RNG state

All authoritative randomness must pass through this subsystem.

## Spatial

Owns:

* Hex coordinates
* Passability
* Distance
* Neighborhood queries
* Spatial indexing
* Pathing
* Effective travel distance

## Agents

Owns:

* Opportunity generation
* Action evaluation
* Probabilistic selection
* Action execution
* Decision traces

## Variables

Owns:

* Typed namespaced person variables
* Registry definitions and ordering
* Variable metadata
* Bounded storage
* Initialization contracts

## Influences

Owns:

* Sparse typed influence edges
* Influence indexes
* Modifier evaluation
* Contribution traces

## Relationships

Owns:

* Encounter resolution
* Relationship dimensions
* Relationship updates
* Relationship decay

## Exposure

Owns:

* Exposure evidence
* Co-presence accumulation
* Exposure windows
* Structured experiences

## Development

Owns:

* Plasticity
* Experience-driven variable changes
* Development formulas
* Development traces

## Life Cycle

Owns:

* Explicit life-stage derivation
* Annual mortality, partnership, and birth intervals
* Named life-cycle RNG streams
* Relationship-gated household formation
* Parent links and retained deceased-person history

## Community

Owns:

* Geographic catchments
* Behavioral evidence
* Emergent community measures
* Structural conditions
* Community feedback
* Contributor traces

## Worker

Owns:

* Authoritative simulation execution
* Simulation advancement
* Typed commands
* Projection transport
* Draft-world state and mutation
* Continuation behavior

## Projection

Owns non-authoritative:

* Viewport projections
* Level-of-detail aggregation
* Marker budgets
* Regional summaries
* Inspection projections
* Draft preview projections

Projection state must never affect canonical simulation output.

## Persistence

Owns:

* Snapshots
* Imports and exports
* Validation
* Migration/rejection
* Persisted events and statistics
* Draft serialization where applicable

## UI

Owns:

* Visualization
* Controls
* Inspectors
* Map interaction
* Overlays
* Diagnostics
* Draft-authoring tools

The UI sends commands rather than bypassing subsystem ownership.

---

# Reproducibility Model

The simulation is designed so identical versioned inputs produce identical canonical results.

Relevant inputs include:

* Initial state
* Configuration
* Seed
* Engine version
* World-generator version
* Registry/model versions
* Snapshot schema where persisted state is involved

Authoritative outcomes must not depend on:

* `Math.random()`
* Wall-clock time
* Rendering timing
* Worker scheduling
* Browser performance

Simulation randomness uses named seeded RNG streams.

RNG state is persisted where required so a restored simulation can continue the same random sequence.

---

# Canonical State

Canonical state contains everything required to continue the simulation reproducibly.

Examples include:

* World state
* People
* Person variables
* Households
* Activities
* Relationships
* Exposure state
* Development state
* Community state
* RNG state
* Version information

Presentation-only state is excluded.

Examples include:

* Camera position
* Viewport caches
* Level-of-detail selection
* Render throttling
* Marker layout
* Non-authoritative UI selections

Canonical state digests provide deterministic regression checks.

---

# Time Model

The base simulation cadence is one hour per tick.

Higher-level systems derive their cadence from simulation time.

Examples include:

* Hourly needs and activities
* Co-location encounters
* Exposure accumulation
* Bounded exposure windows
* Daily community aggregation
* Age-dependent development

Wall-clock time does not determine simulation progression.

---

# Spatial World

The world uses hex-based spatial geography.

Current spatial capabilities include:

* Axial coordinates
* Passability
* Neighborhood queries
* Distance
* Activity locations
* Household homes
* Settlements
* Geographic community catchments
* Placement zones
* World-scale projections
* Level-of-detail aggregation

The authoritative world remains spatial even when the UI displays aggregated regions.

---

# People and Variables

Person state uses typed, namespaced variables.

Current traits include:

* Curiosity
* Risk tolerance
* Sociability
* Trust propensity
* Conformity
* Persistence

Current short-term states include:

* Hunger
* Fatigue

Current needs include:

* Social connection

These categories remain semantically distinct even if they share registry or storage infrastructure.

Bounded integer permille values are used where appropriate.

---

# Influence System

Behavioral and developmental effects use a sparse influence graph.

Examples:

```text
person.trait.curiosity
  -> exploration action utility
```

```text
community.innovationClimate
  -> exploration opportunity utility
```

Influences are explicit typed edges rather than a complete pairwise variable matrix.

Influence evaluation preserves structured metadata for explanation traces.

Detailed semantics are defined in:

```text
docs/TRAIT_AND_INFLUENCE_SYSTEM.md
```

---

# Agent Decisions

People receive context-dependent action opportunities.

The general flow is:

```text
person state
  + location/context
  + available opportunities
  + relationships
  + sparse influences
  -> action utility
  -> probability
  -> seeded selection
  -> execution
```

Probabilistic choices remain reproducible because random selection uses deterministic named streams.

Important evaluations retain structured explanation data.

---

# Relationships and Encounters

Social encounters arise from physical co-location rather than global pairwise comparison.

Current relationship dimensions can include:

* Familiarity
* Interaction frequency
* Affection
* Trust
* Respect
* Fear

Relationship dimensions remain independent.

Encounter processing uses spatially bounded candidate pools rather than global O(N²) comparisons.

Relationships can affect future interactions.

---

# Households and Activities

Household topology is distinct from social relationship state.

Current household concepts include:

* Household membership
* Parent-child links
* Home locations
* Adult and child roles
* Variable household generation

People also follow versioned activity patterns involving locations such as:

* Home
* Commons/activity locations
* Travel

Activity determines physical exposure and therefore affects:

* Encounters
* Needs
* Exposure
* Statistics
* Future behavior

Household membership alone does not imply social trust, affection, or exposure.

---

# Exposure and Development

The first implemented developmental mechanism models parent-child curiosity exposure.

Exposure depends on qualifying physical co-presence.

Tracked evidence includes:

* Recipient exposure hours
* Source hours
* Weighted source values
* Source identifiers

Completed exposure windows produce structured experiences.

Experiences are distinct from permanent traits.

The initial developmental relationship is:

```text
parent curiosity exposure
  -> curiosity development
```

Development accounts for:

* Current value
* Source value
* Exposure strength
* Age-dependent plasticity
* Fixed-point rounding
* Value bounds

Development is currently deterministic once the experience exists and requires no additional random draw.

Development changes preserve structured traces.

Milestone 11 extends this through three additional bounded monthly experience channels:

* Repeated resolved peer encounters can influence trust propensity, sociability, and conformity, with relationship trust attenuating the modeled peer value.
* Completed exploration can develop persistence through an activity-practice experience.
* Actual adolescent/adult time in a geographic community catchment can create low-plasticity social-trust, cohesion, or innovation-climate experiences.

These are exposure records and structured experiences—not direct assignment of a household or community average to a person. The first activity channel deliberately does not create a skill system; skills remain a separate future semantic layer.

This is a fictional simulation mechanism, not a biological claim.

---

# Emergent Communities

Communities are currently geographic catchments rather than person membership fields.

People contribute evidence according to their actual location and behavior.

Current emergent measures include:

* Social trust
* Cohesion
* Cooperation
* Conflict
* Innovation climate

Structural conditions such as food security remain semantically separate.

Community feedback creates a macro-to-micro loop:

```text
individual behavior
  -> community evidence
  -> emergent community conditions
  -> future action opportunities
```

The current conflict measure is a simulation proxy and is not equivalent to warfare.

---

# World Creation

World creation uses a versioned deterministic creation request.

Current configurable concepts include:

* World name
* Seed
* Dimensions
* Physical scale
* Initial population
* Settlements
* Population-placement zones

Terrain generation is deterministic for the same versioned request and seed.

Population placement is resolved after generated terrain exists so UI presets do not guess passability.

Household generation remains reproducible.

Settlements currently represent named geographic places only.

They do not inherently imply:

* Government
* Political ownership
* Culture
* Economy
* Community membership

Exact generator limits should be read from implementation rather than duplicated here as permanent product guarantees.

---

# Draft Map Authoring

Draft authoring is worker-owned and remains separate from authoritative simulation state.

The ownership model is:

```text
UI editing command
  -> worker-owned draft
  -> draft mutation
  -> bounded preview
  -> validation
  -> explicit commit
  -> authoritative world
```

## Draft Lifecycle

Implemented capabilities include:

* Create draft
* Preview draft
* Update draft
* Reset draft
* Persist and rehydrate draft
* Validate draft
* Commit draft
* Discard draft

Committing uses the same authoritative world-creation boundary used for a new run.

## Placement Zones

Implemented authoring supports:

* Multiple named zones
* Exact population allocations
* Deterministic west/central/east presets
* Configurable preset radius
* Optional settlement association
* Monotonic editor zone IDs
* Worker-owned preset resolution
* Canonically sorted resolved cells
* Validation of overlap, passability, anchors, and allocations

Imported already-resolved zone cells remain resolved rather than being silently converted into presets.

## Direct Zone Drawing

Direct drawing uses a bounded generated-terrain viewport.

Users may select qualifying cells and explicitly apply the resulting canonical selection.

The worker validates and persists the selection.

Drawing:

* Does not mutate terrain
* Does not move settlement anchors
* Cannot silently commit stale preview state

## Terrain-Type Painting

Terrain and elevation painting store sparse, canonically ordered cell overrides in the worker-owned draft. Bounded paint commands update terrain-derived passability and preview validation deterministically. Elevation uses the generator's explicit 0–1000 cell scale; an explicit terrain-type edit remains authoritative when both edit the same cell. The same overrides are applied by the authoritative creation path only when the draft is explicitly committed.

Next:

* Milestone 9 — Environmental and Resource Dynamics

See `docs/ROADMAP.md` for subsequent settlement editing, roads, import/export, and later authoring work.

---

# Rendering and Projection

Rendering uses bounded worker projections rather than transferring the complete authoritative world to the UI.

Current projection capabilities include:

* Exact local cells
* Regional aggregation
* World-level aggregation
* Population markers
* Activity markers
* Household markers
* Relationship segments
* Hooked-person summaries
* Settlement summaries
* Population-zone summaries
* Draft previews

Projection size is bounded independently from authoritative world size.

---

# Level of Detail

At local scale:

* Individual cells may be rendered.
* Hex outlines may be visible.
* Individual markers may be shown.

At larger scales:

* Cells aggregate.
* Hex outlines disappear.
* People and annotations aggregate.
* Markers remain bounded in screen space.
* Counts and statistics are preserved.

Rendering fidelity does not change simulation fidelity.

---

# Hooked Person Inspection

A user can hook a person for continued inspection.

A hooked person:

* Remains highlighted while visible
* Continues updating in the inspector
* Can report offscreen status
* Does not force camera movement

Hooking is presentation/inspection state rather than authoritative simulation state.

---

# Worker Execution

The worker owns simulation advancement.

Long logical advances may yield periodically to preserve UI responsiveness.

Simulation advancement and render-frame cadence are independent.

Worker scheduling differences must not affect canonical simulation results.

Continuation state required to resume partially completed logical work must preserve deterministic behavior while remaining appropriately separated from canonical world semantics.

---

# Persistence and Versioning

Persistence contracts are explicit and versioned.

When a persisted format changes, the project must either:

* Provide an explicit tested migration, or
* Explicitly reject unsupported formats

Unsupported serialized state must never be silently reinterpreted.

Versioned contracts currently include concepts such as:

* Engine behavior
* Snapshot schema
* World generation
* Variable registries
* Influence registries
* Household models
* Activity registries
* Development registries
* Community registries

Current numeric versions should be read from source rather than duplicated here.

A version changes only when its corresponding behavioral or compatibility contract changes.

---

# Scaling Boundaries

Rendering currently scales beyond the authoritative dense simulation model.

Known future scaling areas include:

* Dense authoritative world storage
* Very large populations
* Population paging
* Cohort simulation
* Chunked world state
* Dirty-region updates
* Background aggregation
* OffscreenCanvas
* Parallel simulation

These remain deferred until measured constraints justify them.

Performance work should be driven by observed bottlenecks rather than speculative future requirements.

---

# Diagnostics and Explainability

Diagnostics are a first-class part of the workbench.

Important inspectable information includes:

* Seed
* Tick/date
* Simulation speed
* Person variables
* Needs and states
* Current activity
* Household information
* Relationships
* Action explanations
* Experience traces
* Development traces
* Community measures
* Community contributor traces
* Meaningful events
* Sampled metrics
* Cell information
* World-generation information

The simulator should make it possible to investigate why an observed outcome occurred.

---

# Testing

The project uses several complementary test strategies:

* Exact unit tests for deterministic formulas and boundaries
* Fixed-seed regression tests for reproducibility contracts
* Controlled scenario tests for causal behavior
* Multi-seed statistical tests for probabilistic tendencies
* Invariant tests for system rules
* Persistence tests for serialization and compatibility
* Playwright tests for important browser-visible workflows

Do not infer probabilistic tendencies from a single seed.

Common validation commands are:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

During implementation, targeted validation should be used before broad suites.

See `AGENTS.md` for risk-based validation and agent workflow rules.

---

# Current Non-Goals

Systems intentionally outside the current implementation include detailed versions of:

* Politics and government
* Warfare
* Religion
* Language
* Economics and financial systems
* Technology progression
* Genetics
* Disease
* Ecology
* Narrative generation
* Multiplayer
* Collaborative editing
* Massive cohort simulation

Some are planned future areas.

See `docs/ROADMAP.md` for sequencing.

---

# Documentation Responsibilities

## `README.md`

Describes the system as currently implemented.

Keep:

* Current architecture
* Current subsystem semantics
* Current important behavioral boundaries
* Current scaling limitations

Avoid detailed future planning here.

## `docs/ROADMAP.md`

Describes:

* Milestone status
* Planned sequencing
* Future capability scope
* Explicitly deferred work

## `AGENTS.md`

Defines:

* Engineering constraints
* Agent behavior
* Delegation policy
* Validation strategy
* Scope control
* Definition of done

## `docs/TRAIT_AND_INFLUENCE_SYSTEM.md`

Defines detailed target semantics for:

* Person variables
* Influences
* Exposure
* Development
* Related community feedback

Tests and serialized fixtures provide the executable behavioral and compatibility contract.

---

# Getting Started

Install dependencies:

```powershell
pnpm install
```

Run development mode:

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

Build:

```powershell
pnpm build
```

Run end-to-end tests:

```powershell
pnpm test:e2e
```

---

# Long-Term Direction

The intended simulator is not a scripted story generator.

Complex outcomes should emerge from understandable lower-level mechanisms:

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

Each new layer should be grounded in systems that already produce evidence capable of supporting it.

Complexity should be earned incrementally.
