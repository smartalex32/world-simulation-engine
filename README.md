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
* Milestone 11 — Broader Human Development
* Milestone 12 — Occupations, Production, and Exchange
* Milestone 13 — Institutions and Organizations
* Milestone 14 — Culture, Norms, and Beliefs
* Milestone 15 — Language
* Milestone 16 — Local Governance Foundation
* Milestone 17 — Interpersonal Conflict Foundation
* Milestone 18 — Politics and Government Foundations
* Milestone 19 — Massive Simulation Scale (bounded inspection transport foundation)
* Milestone 20 — Historical Inspection (evidence history foundation)
* Milestone 21 — Optional Narrative Presentation (deterministic template presentation)
* Milestone 22 — Simulation Workbench Experience (map-first presentation foundation)
* Milestone 23 — Settlement Profiles (nearby-home scale foundation)
* Milestone 24 — Settlement Catchments and Inspection
* Milestone 25 — Water, Routes, and Geographic Accessibility
* Milestone 26 — Household Relocation and Settlement Change
* Milestone 27 — Local Goods and Exchange Places
* Milestone 28 — Settlement Services and Institutions
* Milestone 29 — Regional Routes and Inter-Settlement Networks
* Milestone 30 — Spatial Cultural and Language Diffusion
* Milestone 31 — Territorial Governance and Civic Legitimacy
* Milestone 32 — Collective Conflict and Resolution
* Milestone 33 — Seasonal Climate, Agriculture, and Ecology (first environmental feedback foundation)
* Milestone 34 — Health, Disease, and Demographic Stress (fictional health-stress foundation)
* Milestone 35 — Skills, Experimentation, and Practical Innovation
* Milestone 36 — Historical Snapshots and Causal Replay
* Milestone 37 — Scalable Authoritative Simulation
* Milestone 38 — World Builder and Workbench Maturity
* Milestone 39 — Collaboration and Shared Worlds
* Milestone 40 — Designed Landmass and Water Authoring
* Milestone 41 — Settlement Seeds and Authoring Profiles
* Milestone 42 — Food Security, Settlement Growth, and Migration Signals
* Milestone 43 — Hosted Single-Node Simulation Boundary
* Milestone 44 — Measured Ten-Thousand-Person Scale
* Milestone 45 — Fidelity Regions and Population Aggregation
* Milestone 46 — Long-Term World History and Change Inspection
* Milestone 47 — Large World Coordinate and Chunk Contract
* Milestone 48 — Server-Owned World Runs (foundation)
* Milestone 49 — Background Simulation Jobs and Checkpoints (foundation)
* Milestone 50 — Hosted Authority and Background-Job Correctness

Settlement editing is also available in the same draft workspace. Authors can add, remove, rename, and place named settlement anchors on passable cells. A settlement remains a geographic marker: it does not imply governance, culture, economy, or automatic community membership. The workbench derives a read-only landmark/hamlet/village/town/city profile from living homes near an anchor, making its geographic basis explicit rather than assigning residents a settlement field. Linked population zones retain their existing anchor-containment validation.

Initial placement also supports explicit `town`, `village`, and `dispersed-homesteads` templates. Town homes begin at the settlement anchor, village homes use nearby zone cells, and dispersed homesteads use the authored placement zone. Town and village templates add one worker-owned market at their real anchor location; dispersed homesteads deliberately create neither a settlement marker nor a market. These are bounded starting-geography and resource-access choices, not social memberships or claims about later institutions.

Draft roads are ordered, contiguous passable-cell segments. They are validated by the worker, serialize with authored worlds, and render on exact-cell map projections. Current agent movement is intentionally unchanged: route-aware road travel is deferred until a route-planned movement system exists.

Drafts can also be imported and exported as a versioned JSON bundle. Bundles include the draft record, generator version, dimensions, scale, seed, terrain/resource edits, population zones, settlements, and roads; incompatible versions are rejected rather than silently reinterpreted.

Historical inspection reads bounded, indexed event and sampled-metric evidence from IndexedDB. The History workspace offers selected-person timelines, curated major recorded-event highlights, population/resource/social trends, and an optional deterministic chronicle. The chronicle uses fixed templates over recorded events; it never invents evidence, mutates authoritative simulation state, or affects canonical output. Household and settlement history views, time-lapse replay, and richer causal drill-down remain future slices.

Retained weekly checkpoints also record bounded regional evidence: detailed and
cohort population, cohort households, available food, and settlement scale,
resident, household, and food-store values. The History workspace compares
only these retained observations; it does not replay or mutate a run to fill
historical gaps.

The workbench now provides coherent world, simulation, analytics, entities, history, tools, and settings navigation. Tools connect to the worker-owned world authoring flow; settings expose presentation diagnostics only. The map remains the primary surface, with existing level-of-detail behavior, live inspectors, controls, sampled aggregates, and responsive layouts. This presentation layer does not alter simulation state or consume simulation RNG.

The minimap is also keyboard accessible: Enter or Space recenters the map and
its focus/assistive text describes it as a presentation-only navigation control.

Settlement inspection also exposes read-only infrastructure evidence from real
catchment-local markets, schools and their seats, and authored road cells. It
does not imply civic membership or directly modify people.

The analytics surface also reports read-only household material distribution:
food and tools remain separate, alongside zero-food households, separate Gini
indicators, and living occupation counts. This is not a combined wealth score
or a money, price, ownership, or trade model.

Existing school organizations also have read-only group profiles in the entity
catalog. These show the explicit goal, member roles, capacity, shared rules,
and member-to-member relationships already recorded by the simulation. Group
membership does not create a relationship, reputation, resource ownership, or
automatic person-level effect.

Local governance is also presented as bounded evidence for an observed
geographic catchment: active representatives, legitimacy, food-relief access,
fairness, and the status of its council reference. It does not turn a
catchment into legal territory, civic membership, culture, or identity.

The analytics workbench also explains the current local food-relief legitimacy
calculation through its bounded service-access, contribution-fairness,
social-trust, and conflict-absence inputs. Taxation, budgets, law,
enforcement, and corruption are explicitly not modeled in this first public-
capacity slice.

Culture and language analytics summarize the existing person-owned learned
beliefs and language fluencies only across observed home catchments. These
observations do not assign collective culture, religion, identity, or polity
membership, and they do not alter behavior.

Contention analytics summarize only recorded interpersonal disputes within an
observed catchment. They make current non-lethal local resolution evidence
visible but do not imply diplomacy, military organization, occupation, or
warfare.

Knowledge and innovation analytics summarize existing person-owned learned
knowledge and practical techniques by observed home catchment. They do not
assign a technology tier, shared tool ownership, or automatic diffusion, and
they do not alter innovation behavior.

Generational analytics summarize retained child development records by observed
home catchment: parent links, inheritance traces, completed experiences, and
recorded changes. They do not yet model adult feedback into the next generation
or infer a society-level developmental loop.

Seasonal climate is a small static classification derived from terrain and elevation. It changes seasonal water availability, food regeneration, and the productivity of the existing plain-cell agricultural work path. Daily environmental recovery is measured separately from household food production and consumption; no weather simulation, biome editor, or ecosystem model is implied.

Health stress is a fictional, inspectable temporary state. It is calculated from actual hourly co-presence, cell crowding, water access, and hunger; it adds only a bounded annual mortality-risk component. There are no pathogens, clinical claims, or disease transmission mechanics.

Milestone 54 begins environmental hydrology with a deterministic derived
drainage graph. Each exact map cell exposes its strictly downhill flow target
or terminal basin sink in the cell inspector. This is derived evidence from
authored elevation, not mutable water simulation; lakes, river rendering,
watershed fill, climate expansion, and ecology remain later slices.

Milestone 55 begins settlement-seed authoring with homestead, hamlet, village,
town, city, and dispersed-homestead profiles. Before a draft is committed, the
creator reports derived home-cell, density, renewable-resource, and
home-to-marker travel evidence. Profile capacities are authoring guidance, not
population caps or social membership; detailed browser authoring remains
bounded to 500 people until cohort allocation is introduced.

Milestone 56 begins cohort simulation with a versioned authoritative ledger for
explicit distant-population allocations. A zone may retain its bounded detailed
people while assigning a much larger static cohort; exact population,
household, food, age-band, event-total, and cell-allocation evidence is stored
in snapshots and included in population/map summaries. Cohorts do not yet
advance, form relationships, or materialize into detailed people.

Milestone 57 begins fidelity transitions with a deterministic, non-mutating
materialization plan. It exposes exact requested and residual totals plus
canonical cell allocations, and refuses automatic conversion whenever protected
detailed identities (including a hook) are present. Actual materialization and
dematerialization remain separate authoritative state transitions.

Milestone 58 begins retained settlement scale. Each geographic settlement
evaluates nearby living homes, catchment resource capacity, and water access on
a monthly cadence. A 20% lower-population buffer prevents a retained
homestead/hamlet/village/town/city scale from oscillating at a boundary.
Transitions are explicit events with population, density, resource, and access
evidence. The system does not assign people settlement membership or invent
unimplemented regional migration behavior.

Milestone 53 begins large-landmass authoring with an explicit physical hex
radius. Authors may choose a 100 m–10 km axial-cell radius; it is normalized,
preserved in world creation and snapshots, and shown in the setup surface. The
default remains 1 km for legacy worlds. Terrain remains dense within the
existing bounded creator until sparse chunk allocation is introduced.

Milestone 51 added a rolling snapshot migration registry for schemas 30–32, preserving the
existing full validation contract after each one-step migration. Browser worker
snapshot callers now receive explicit timeout, crash, and disposal failures,
and hosted persistence ordering uses a locale-independent binary comparator.

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

## Optional hosted single-node runtime

The browser-hosted workbench remains the default. Milestone 43 also provides a
small Node-hosted boundary for one owner-controlled run. It reuses typed worker
command/response shapes, serializes authoritative commands on the host, writes
versioned snapshots through an atomic file store, and returns bounded
projections. Start it with `HOSTED_OWNER_TOKEN=<secret> pnpm host`; its local
HTTP API is intentionally limited to `/health`, owner-authorized run projection,
and owner-authorized typed run commands. It is not collaboration, a public API,
or a multi-node scheduler.

Milestone 44 adds a reproducible detailed-agent scale benchmark: `pnpm
benchmark:scale` creates a 128 × 128 blank-land world with 10,000 people,
advances it one hour, and verifies snapshot restoration against the canonical
digest. Hosts may opt into that same initial population using
`HOSTED_WORLD_POPULATION=10000`; the browser world-builder deliberately retains
its 500-person authoring guardrail. The benchmark reports elapsed time as local
evidence only—hardware timing does not affect simulation output.

Milestone 70 begins civilization-scale integration validation with `pnpm
audit:civilization`. The audit deliberately exercises the normal engine through
a 30-day checkpoint, restores its complete versioned snapshot, advances both
the uninterrupted and recovered runs for another week, and compares canonical
digests. Its JSON evidence reports current geography, population, households,
social relationships/disputes, material stores, civic records, learning, and
development; it is a reproducibility/recovery contract, not a claim that all
civilization systems are implemented.

Milestone 45 makes far-map population aggregation explicit rather than an
implicit rendering shortcut. Every map projection now reports a versioned
population-fidelity contract: detailed cells or exact aggregate regions, the
visible population count, and the reversible `zoom-or-focus` handoff. This is
presentation-only: the authoritative engine remains detailed-agent simulation,
and a hooked person always retains a live marker and inspector record.

Milestone 46 extends Historical Inspection with compact, read-only checkpoint
summaries. The History view compares living population and geographically
measured settlement home-catchment residents/households only at retained weekly
checkpoints. It neither replays a run nor changes the active world; missing
checkpoints remain visible as missing evidence rather than inferred history.

Milestone 49 adds the first host-owned background advancement boundary. An
owner can create a bounded deterministic job through the local host, inspect
its persisted progress, or cancel it between advancement quanta. Every quantum
persists the authoritative snapshot; reopening a host reconciles an incomplete
job against that snapshot before continuing. Wall-clock scheduling affects only
when a quantum begins, never the simulation result.

Milestone 50 hardens that foundation. A catalog deduplicates concurrent opens,
and one FIFO job manager owns authoritative advancement for each hosted run.
Every job quantum records its expected tick/digest before execution and commits
the resulting tick/digest afterward; a restart can recover that exact pending
quantum but marks unrelated run mutation as a visible job failure. Queued jobs
cancel immediately, running jobs cancel at their next persisted quantum
boundary, and direct step/reset commands are rejected while a job owns the run.
Hosted run and job records are validated before use. The local HTTP boundary
uses owner authorization, bounded JSON bodies, sanitized errors, and a
configurable `HOSTED_BIND_HOST` (default `127.0.0.1`). Hosted job record version
1 is explicitly rejected; rolling migration support is Milestone 51. This
remains a single-node, single-owner foundation rather than a distributed queue
or public scheduler.

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

## Knowledge

Knowledge is person-owned learned state, separate from traits and skills. The first version includes foraging and local-terrain knowledge. Completed exploration adds local-terrain knowledge; positive, co-present encounters may transfer a bounded portion of a knowledge gap according to the recipient's directional relationship trust. Foraging knowledge produces a bounded harvest-yield improvement. These outcomes are visible in per-person traces and meaningful events. No global technology tree or automatic organization-membership transfer exists.

Practical innovation is likewise person-owned. During real productive work, a forager with sufficient foraging knowledge and a household tool may make a seeded experiment attempt. A success consumes the tool, records provenance, and grants only that person a bounded efficient-harvest technique; it does not create an era, global technology, or instant diffusion.

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
* A monthly, bounded relocation evaluation based on real local food access,
  household food reserves, route travel cost, nearby relationship ties,
  crowding, and household risk tolerance

Successful relocation is resolved through its own named random stream. It moves
the household home activity and every member's future home exposure, then retains
an inspectable score/probability/roll trace, including material-reserve pressure,
and a meaningful event. It does not
assign people a settlement membership or model property ownership.

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

The first local-exchange slice adds a single worker-owned market at an existing
commons location. Co-present households may deterministically exchange one
durable tool when one has surplus and another has need. No currency, price, or
settlement membership is inferred.

Schools are worker-owned, fixed-capacity services at real commons locations.
At the scheduled daily service hour, each enrolled living learner receives one
draw from the named school-attendance stream. Route cost (including road
discounts), an available adult in the household, curiosity, and persistence
determine the inspectable attendance probability. Successful attendees occupy
the school location for the eight-hour window and accumulate learning hours;
missed opportunities retain an explicit reason. School enrollment and a school
location do not assign settlement membership, culture, or beliefs.

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

Future shared-world work is governed by the
[`Collaboration and Shared Worlds Authority Model`](./docs/COLLABORATION_AND_SHARED_WORLDS.md).
It deliberately retains one editing lease per draft and one authoritative
executor per simulation run; collaboration is not yet implemented in the local
application.

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

Terrain baseline selection supports the legacy seeded valley and a deterministic
blank-land canvas. Blank land starts as passable plain terrain so authors can
paint bounded water around an intended landmass before placement; changing the
baseline clears prior sparse terrain, elevation, and resource edits rather than
silently reinterpreting them.

Terrain and elevation painting store sparse, canonically ordered cell overrides in the worker-owned draft. Bounded paint commands update terrain-derived passability and preview validation deterministically. Elevation uses the generator's explicit 0–1000 cell scale; an explicit terrain-type edit remains authoritative when both edit the same cell. The same overrides are applied by the authoritative creation path only when the draft is explicitly committed.

See `docs/ROADMAP.md` for the current milestone, acceptance criteria, and later
authoring work.

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

Workbench transport is independently bounded: when a view contains more than the inspector-detail budget, the worker sends only deterministic local details plus any hooked person and their household. Population and map aggregates retain their complete counts; hooking another person requests that person's current detail next frame. This is presentation paging, not cohort simulation or a reduction in authoritative fidelity.

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
