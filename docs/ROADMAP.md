# World Simulation Engine — Roadmap

## Purpose

This roadmap defines the staged development path for the World Simulation Engine.

Development proceeds through small, independently reviewable vertical slices.

The core product loop is:

```text
geography and environment
  -> individual exposure and experience
  -> probabilistic behavior and development
  -> social interaction
  -> emergent community conditions
  -> new exposure for current and future people
```

The simulator should eventually support:

* Large worlds
* Large populations
* Long simulation time spans
* Rich social systems
* Emergent communities and societies
* Inspectable individual lives
* Explainable macro-level outcomes

Future systems should be introduced only when lower-level mechanisms provide a concrete foundation for them.

---

# Roadmap Rules

## Vertical Slices

Prefer the smallest behavior that can be implemented, observed, tested, and reviewed independently.

A typical slice may cross:

```text
domain/configuration
  -> simulation
  -> worker/persistence
  -> projection
  -> UI inspection
  -> tests
```

Not every slice requires every layer.

## Reproducibility

Simulation-affecting milestones must preserve or deliberately version:

* RNG ownership and ordering
* Serialization
* Canonical digests
* Engine/model contracts
* Compatibility behavior

Detailed engineering rules belong in `AGENTS.md`.

## Explainability

New behavioral systems should produce enough structured evidence to understand why important outcomes occurred.

## Incremental Complexity

Higher-level systems should build on mechanisms already present.

Examples:

```text
individual behavior
  -> institutions

resources and exchange
  -> detailed economics

institutions and collective decisions
  -> governance

organized groups and resource conflict
  -> warfare
```

Do not implement distant systems merely because they appear later in this roadmap.

---

# Status Summary

## Implemented

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
* Milestone 8B.2A — Deterministic Preset Placement Zones
* Milestone 8B.2B — Direct Placement-Zone Drawing
* Milestone 8B.3 — Terrain Painting
* Milestone 8B.4 — Settlement Editing
* Milestone 8B.5 — Roads
* Milestone 8B.6 — Draft Import and Export

## Next Slice

* Milestone 9 — Environmental and Resource Dynamics

Detailed current implementation is documented in `README.md`.

---

# Completed Foundation

Completed milestones are summarized here for sequencing context only.

Refer to `README.md` for current architecture and behavior.

## Milestone 0 — Deterministic Simulation Core

Status: Implemented

Established:

* Fixed simulation time
* Seeded RNG
* Named random streams
* Snapshot-restorable RNG state
* Canonical state
* Deterministic digests
* Worker-owned execution

---

## Milestone 1 — Spatial World and Movement

Status: Implemented

Established:

* Hex geography
* Passability
* Spatial queries
* Agent locations
* Movement and travel
* Spatially constrained behavior

---

## Milestone 2 — Agent Decisions and Actions

Status: Implemented

Established:

* Context-dependent opportunities
* Utility evaluation
* Seeded probabilistic selection
* Action execution
* Structured explanation traces

---

## Milestone 3 — Social Encounters and Relationships

Status: Implemented

Established:

* Spatial encounter pools
* Persistent relationship dimensions
* Social interaction outcomes
* Relationship updates and decay
* Social inspection and statistics

---

## Milestone 4 — Variable, Trait, and Influence Registries

Status: Implemented

Established:

* Typed namespaced person variables
* Traits, states, and needs
* Sparse influence edges
* Fixed-point modifier evaluation
* Versioned registries
* Structured contribution traces

---

## Milestone 5A — Activities and Household Topology

Status: Implemented

Established:

* Households
* Parent-child topology
* Home/activity locations
* Adult and child schedules
* Travel
* Aging
* Household inspection

Household topology remains distinct from social relationship state.

---

## Milestone 5B — Exposure, Experiences, and Development

Status: Implemented

Established:

* Co-presence exposure
* Structured experiences
* Parent-child curiosity modeling
* Age-dependent plasticity
* Deterministic developmental changes
* Development traces

Exposure arises from actual qualifying experience rather than membership alone.

---

## Milestone 6 — Emergent Community Feedback

Status: Implemented

Established:

* Geographic catchments
* Community evidence aggregation
* Social trust
* Cohesion
* Cooperation
* Conflict
* Innovation climate
* Community-to-behavior feedback

Community measures remain distinct from person membership.

---

## Milestone 7 — Large-World Rendering and Simulation Scale

Status: Implemented

Established:

* Bounded viewport projections
* Level-of-detail rendering
* Regional aggregation
* Marker budgets
* Hook-preserving inspection
* Responsive worker advancement

Rendering can scale independently from authoritative simulation storage.

---

## Milestone 8A — Reproducible World Creation

Status: Implemented

Established:

* Versioned creation requests
* User-defined world configuration
* Deterministic terrain generation
* Settlements
* Population-placement zones
* Deterministic household/population creation

Settlements remain named geographic places without implied government, culture, economy, or community membership.

---

# Milestone 8B — Draft Map Authoring

Status: Implemented

## Goal

Allow users to design and preview a world before committing it to authoritative simulation state.

The ownership model is:

```text
UI editing tools
  -> worker-owned draft
  -> deterministic draft mutation
  -> bounded preview
  -> validation
  -> explicit commit
  -> authoritative simulation
```

Draft state must remain separate from the active simulation.

---

## Milestone 8B.1 — Draft World Lifecycle

Status: Implemented

Established:

* Versioned worker-owned draft records
* Draft creation
* Deterministic preview generation
* Draft updates
* Reset and discard
* Persistence and hydration
* Validation
* Explicit commit
* Revision protection
* Commit through the existing authoritative world-creation path

Draft previews remain non-authoritative.

---

## Milestone 8B.2 — Placement Zone Authoring

Status: Implemented

### 8B.2A — Deterministic Preset Zones

Implemented:

* Add/remove named zones
* Stable zone IDs
* Exact population allocation
* West/central/east deterministic presets
* Configurable radius
* Optional settlement association
* Preservation of imported resolved geometry
* Worker-owned canonical resolution
* Overlap/passability/allocation validation
* Stale-preview protection

### 8B.2B — Direct Placement-Zone Drawing

Implemented:

* Bounded draft-map viewport
* Direct explicit zone-cell selection
* Editing of drawn geometry
* Worker validation of submitted geometry
* Spatial preview of zone placement
* Explicit Apply operation
* Canonical worker-owned persisted selection

Current drawing:

* Is limited to qualifying habitable cells
* Does not modify terrain
* Does not move settlement anchors

---

## Milestone 8B.3 — Terrain Painting

Status: Implemented

### Goal

Allow controlled manual modification of generated geography while preserving reproducibility.

### Initial Scope

Introduce editing for:

* Terrain type
* Elevation
* Water
* Resource values

### Required Properties

Editing operations must:

* Be explicit worker commands
* Produce deterministic draft state
* Preserve canonical ordering
* Be serializable
* Be inspectable
* Be version-compatible with draft persistence
* Integrate with existing draft revision protection
* Affect only draft state until explicit commit

### Suggested Vertical Slices

Prefer implementing Terrain Painting incrementally rather than as one large editor.

#### 8B.3A — Terrain-Type Painting

Status: Implemented

Add:

* Selectable terrain type
* Bounded paint operation
* Worker-owned mutation
* Draft preview updates
* Validation
* Persistence
* Deterministic tests

#### 8B.3B — Elevation Painting

Status: Implemented

Add controlled elevation editing after terrain-type mutation is stable.

#### 8B.3C — Water Editing

Status: Implemented through the terrain-type painting command's explicit `water` option.

Introduce water editing only after terrain/elevation semantics are established.

#### 8B.3D — Resource Painting

Status: Implemented

Add initial resource-value editing after the environmental representation required by it is defined.

The implementation may adjust these sub-slices if repository constraints show a smaller or safer boundary.

### Deferred

Do not include yet:

* Erosion
* Complex brush simulation
* Detailed watersheds
* Dynamic climate
* Ecology
* Procedural hydrology simulation

---

## Milestone 8B.4 — Settlement Editing

Status: Implemented

### Goal

Allow authors to manually configure settlements before simulation starts.

### Scope

* Add settlement
* Remove settlement
* Move settlement
* Rename settlement
* Validate placement
* Preview location

Settlements remain geographic places only.

Do not attach:

* Government
* Political ownership
* Culture
* Economy
* Automatic community membership

---

## Milestone 8B.5 — Roads

Status: Implemented

### Goal

Introduce a minimal deterministic transportation structure.

### Initial Scope

* Draw road segments
* Delete roads
* Validate connections
* Serialize geometry
* Render roads at appropriate map scales

### Initial Simulation Effects

No travel-rule change is included yet. The current engine selects and resolves
single-neighbor movement rather than route-planned journeys, so a road cost
modifier would be misleading until that prerequisite exists. Roads are
authoritative, validated map geometry and are rendered at exact-cell detail.

When route planning is introduced, it may add behavior such as:

* Effective travel cost
* Path preference

Do not introduce:

* Traffic
* Trade
* Commerce
* Government ownership
* Maintenance
* Tolls

---

## Milestone 8B.6 — Draft Import and Export

Status: Implemented

### Goal

Allow authored worlds to be shared and resumed reproducibly.

### Draft Format

Include supported:

* Format version
* World-generator version
* Dimensions
* Physical scale
* Seed
* Terrain edits
* Placement zones
* Settlements
* Roads

Imports must:

* Validate schema
* Validate bounds
* Validate compatibility
* Preserve canonical geometry
* Explicitly migrate or reject unsupported formats

---

# Milestone 9 — Environmental and Resource Dynamics

Status: Complete

## Goal

Make environmental conditions materially affect people and households.

Begin with small explainable resource loops rather than a complete ecosystem.

---

## Milestone 9A — Basic Renewable Resource

Status: Complete

### Initial Model

Food availability is the leading candidate.

```text
local food resources
  -> access
  -> hunger / food security
  -> consumption
  -> depletion
  -> regeneration
  -> future availability
```

### Candidate Scope

* Resource quantity by location
* Regeneration
* Consumption
* Resource access
* Local scarcity
* Food-security evidence
* Explainable household/person effects

### Non-Goals

* Full agriculture
* Commodity markets
* Detailed nutrition
* Species/ecology simulation
* Detailed farming

---

## Milestone 9B — Seasonal Environment

Status: Complete

Potential capabilities:

* Seasons
* Temperature
* Rainfall
* Resource-regeneration modifiers
* Travel modifiers
* Environmental suitability

Prefer deterministic calendar-driven changes initially.

Any stochastic environment behavior must use named RNG streams.

Implemented: a four-season, 30-day deterministic calendar controls daily food regeneration and movement-cost evaluation. It consumes no random draws and is derived entirely from the simulation tick.

---

## Milestone 9C — Environmental Exposure

Status: Complete

Allow physical location and time spent there to produce environmental exposure.

Potential examples:

* Heat
* Cold
* Resource access
* Terrain difficulty
* Water availability

Continue the existing exposure-over-membership principle.

Implemented: each person retains inspectable lifetime counters for actual occupied-cell hours, food-access hours, difficult-terrain hours, and calendar-derived thermal load. These counters are observations only; they do not assign effects based on settlement or community membership.

---

# Milestone 10 — Life Cycle and Population Dynamics

Status: Complete

## Goal

Allow populations and households to evolve across long simulation time spans.

---

## Milestone 10A — Life Stages

Status: Complete

Candidate scope:

* Explicit life-stage transitions
* Age-dependent schedules
* Age-dependent needs
* Plasticity transitions
* Adult independence

Build on existing aging rather than replacing it.

Implemented: explicit infant, child, adolescent, adult, and older-adult stages are derived from age and emitted as inspectable transitions. Existing child/adult schedules remain stable; an adolescent schedule identifier is reserved until it has a separately validated activity behavior.

---

## Milestone 10B — Mortality

Status: Complete

Candidate scope:

* Age-dependent mortality
* Explicit RNG ownership where probabilistic
* Household updates
* Relationship updates
* Activity cleanup
* Population/index cleanup
* Persistence
* Statistics
* Inspector behavior

Death must preserve referential integrity.

Implemented: annual, age-banded mortality uses a dedicated snapshot-restorable RNG stream. Dead people retain their identity, history, relationships, and parent links but no longer act, move, consume, encounter, or contribute new exposure.

---

## Milestone 10C — Partnership and Household Formation

Status: Complete

Potential capabilities:

* Partnership formation
* Household merging
* Departure from parental home
* Household splitting

Partnership formation should build on actual relationships and interaction history rather than global arbitrary matching.

Implemented: annual partnership candidates require mutual familiarity, interaction history, trust, and affection from an existing relationship. A qualifying single-person household can merge into the partner's household; every move and partnership is an event.

---

## Milestone 10D — Birth and Children

Status: Complete

Potential capabilities:

* Birth
* Parent links
* Household insertion
* Child schedules
* Person-variable initialization
* Stable RNG ownership

Do not introduce unsupported biological/genetic claims.

Implemented: partnered adult pairs can produce a child during the annual life-cycle interval. The child receives a household, parent links, activity/development state, a structured curiosity inheritance trace, bounded initialized variables, and a unique stable ID. This is a fictional configurable starting-predisposition model, not a biological claim.

---

# Milestone 11 — Broader Human Development

Status: Complete

## Goal

Expand development beyond the initial parent-curiosity mechanism.

Development should continue to arise from structured experiences.

### Potential Influence Sources

* Parents
* Siblings
* Peers
* Close relationships
* Activities
* Communities
* Institutions
* Major experiences
* Environment

### Potential Variable Categories

* Additional traits
* Values
* Attitudes
* Beliefs
* Preferences
* Skills
* Learned behavior

Keep categories semantically distinct.

---

## Milestone 11A — Peer Development

Potential initial targets:

* Trust
* Sociability
* Conformity

Use repeated interaction and relationship strength.

Start with a very small variable set.

Implemented: repeated resolved encounters accumulate a bounded monthly peer-modeling experience for trust propensity, sociability, and conformity. Each peer value is attenuated by the receiving person's post-encounter relationship trust, so arbitrary co-location and household membership alone do not create peer influence.

---

## Milestone 11B — Activity-Based Development

Potential developmental targets:

* Persistence
* Skill
* Preference
* Confidence

Skills should remain semantically separate from traits.

Implemented: completed exploration actions accumulate an explicit monthly practice experience that can slowly develop persistence. This is intentionally a narrow activity-development proof; no skill registry or occupation model has been introduced before Milestone 12 creates a concrete need for one.

---

## Milestone 11C — Community-to-Person Development

Allow sustained environmental/community exposure to contribute to development.

Do not copy catchment values directly into people.

Track actual exposure duration and intensity.

Implemented: adolescents and adults accumulate monthly exposure only while physically located in a community catchment. Observed social trust, cohesion, and innovation climate can then slowly influence trust propensity, conformity, and curiosity respectively through low-plasticity, inspectable development traces. Catchment values are not copied directly into person state.

All Milestone 11 development is deterministic once its structured evidence exists, uses no new RNG draws, is snapshot-versioned, and remains visible in the person inspector, events, and sampled statistics.

---

# Milestone 12 — Occupations, Production, and Exchange

Status: Implemented

## Goal

Introduce the smallest economic system required to model production, consumption, and scarcity.

Do not begin with money.

---

## Milestone 12A — Work Roles

Potential scope:

* Work activities
* Work locations
* Occupation/role assignment
* Productive time
* Skill requirements
* Production traces

Implemented: people receive an explicit, inspectable `forager`, `household`, or `dependent` role at initialization. Foragers can select a daytime `work` action only from a real commons location with accessible food. The action trace includes base, persistence, resource, and fatigue contributions.

---

## Milestone 12B — Production and Consumption

Start with one or two goods.

The system should answer:

* Who produces it?
* What inputs are required?
* Where is it produced?
* Who consumes it?
* What happens when it is scarce?

Implemented: food is the first whole-unit good. It is harvested from a public geographic-cell resource into a household-owned food store, then consumed from that store. Food depletion therefore creates actual household scarcity and hunger pressure rather than an implied settlement-level effect. Productive hours, production, household food, consumption, and failed meals are sampled daily.

---

## Milestone 12C — Exchange

Introduce exchange only after ownership/access semantics exist.

Potential factors:

* Need
* Availability
* Distance
* Relationships
* Exchange value

Implemented: a daily, non-monetary food-sharing pass transfers a bounded amount only from a nearby household with surplus to a nearby household with need when existing cross-household relationship familiarity provides evidence of access. It is deterministic, records a meaningful event, and preserves household food total.

Deferred:

* Banking
* Corporations
* Financial markets
* Complex currencies

---

# Milestone 13 — Institutions and Organizations

Status: Implemented

## Goal

Allow persistent coordinated groups beyond households.

Potential examples:

* Schools
* Workplaces
* Community organizations
* Religious organizations
* Trade groups
* Governance bodies

---

## Milestone 13A — Generic Organization Model

Potential scope:

* Organization identity
* Location
* Participants
* Roles
* Activities
* Shared rules
* Persistence over time

Membership must not automatically overwrite personal beliefs, traits, or attitudes.

Implemented: persistent, versioned organizations now have identity, kind, location, activity-location reference, explicit member roles, and shared-rule identifiers. The initial specialization is a deterministic local school populated with eligible learners; membership is informational and creates no automatic person-variable changes.

---

## Milestone 13B — Education Institutions

Schools are a strong first specialized institution because they naturally connect:

* Location
* Repeated activity
* Exposure
* Peer relationships
* Development
* Skills/knowledge

---

# Milestone 14 — Culture, Norms, and Beliefs

Status: Implemented

## Goal

Model ideas and practices as socially transmitted behavior rather than static group properties.

Potential concepts:

* Beliefs
* Norms
* Customs
* Values
* Cultural practices
* Group identity

Potential transmission factors:

* Exposure
* Trust
* Relationship strength
* Repetition
* Conformity
* Authority
* Institution participation
* Social context

Do not assign beliefs to everyone in a community merely because they are common there.

Implemented: each person has a separate bounded learned-belief state for exploration and cooperation. Beliefs can shift only after repeated real relationship evidence reaches familiarity and directional-trust thresholds during a positive encounter. The transmission trace records the source and tick; community membership alone produces no cultural assignment.

---

# Milestone 15 — Language

Status: Future

## Goal

Model language as a socially transmitted capability and communication constraint.

Potential capabilities:

* Language knowledge
* Fluency
* Childhood acquisition
* Peer transmission
* Geographic variation
* Communication barriers
* Multilingualism
* Language divergence

Language should emerge through social and geographic mechanisms rather than static faction identity.

---

# Milestone 16 — Governance and Politics

Status: Future

## Preconditions

Governance should wait until meaningful versions of these systems exist:

* Communities
* Population dynamics
* Resources
* Organizations
* Social trust
* Cooperation
* Conflict
* Collective activity

Potential capabilities:

* Leadership
* Collective decisions
* Rules
* Authority
* Legitimacy
* Local governance
* Political groups
* Representation
* Territorial jurisdiction

Governance must remain distinct from settlements and emergent community catchments.

---

# Milestone 17 — Conflict and Warfare

Status: Future

## Goal

Allow organized conflict to arise from existing social, resource, institutional, geographic, and political mechanisms.

The current community `conflict` measure is not warfare.

Potential progression:

```text
interpersonal tension
  -> interpersonal conflict
  -> persistent group conflict
  -> organized violence
  -> warfare
```

Potential prerequisites include:

* Resource scarcity
* Group identity
* Organizations
* Governance
* Territory
* Relationships
* Logistics
* Technology

Do not jump directly from a community conflict metric to armies or warfare.

---

# Milestone 18 — Technology, Knowledge, and Innovation

Status: Future

## Goal

Model knowledge as something people acquire, preserve, transmit, and apply.

Potential capabilities:

* Knowledge
* Skills
* Discovery
* Experimentation
* Innovation
* Technology adoption
* Teaching
* Knowledge transmission
* Tool availability

Potential model:

```text
individual knowledge
  + communication
  + resources
  + experimentation
  + institutions
  -> innovation
  -> diffusion
```

Avoid arbitrary global technology trees unless later requirements justify them.

---

# Milestone 19 — Massive Simulation Scale

Status: Future

## Goal

Represent worlds and populations beyond practical fully individualized dense simulation.

Potential techniques:

* Chunked authoritative world storage
* Population paging
* Regional aggregation
* Cohort simulation
* Dynamic simulation fidelity
* Dirty-region updates
* Background aggregation
* Worker parallelization
* Multi-worker simulation
* OffscreenCanvas
* Sparse environmental storage

A possible future model is:

```text
near / important populations
  -> individual simulation

distant / inactive populations
  -> aggregate or cohort simulation

relevant transition
  -> deterministic materialization
```

This milestone requires substantial research.

Any aggregation strategy must define a reproducibility contract and preserve individual inspectability where intended.

---

# Milestone 20 — Historical Inspection

Status: Future

## Goal

Allow users to understand change across long simulated time spans.

Potential capabilities:

* Person timelines
* Household histories
* Settlement histories
* Community histories
* Population trends
* Geographic change
* Major-event detection
* Causal drill-down
* Historical snapshots
* Time-lapse maps

Historical summaries should derive from authoritative simulation evidence rather than invent events.

---

# Milestone 21 — Optional Narrative Presentation

Status: Future / Optional

## Goal

Potentially provide narrative presentation of simulation history without putting generative AI into authoritative simulation behavior.

If generative AI is eventually used:

```text
authoritative simulation
  -> deterministic structured history
  -> optional narrative presentation
```

Generated narrative must remain:

* Optional
* Non-authoritative
* Replaceable
* Separate from state evolution
* Separate from canonical digests

The simulation must remain fully functional and explainable without it.

---

# Milestone 22 — Simulation Workbench Experience

Status: Future

## Goal

Bring the application workbench toward the intended world-simulation experience: a legible large map surrounded by useful, inspectable simulation controls and entity context. This is a presentation and workflow milestone; it must not move authoritative simulation logic into the UI.

Potential capabilities:

* A coherent world, simulation, analytics, entities, tools, and settings navigation model
* A configurable map-layer panel for terrain, resources, population, routes, settlements, and diagnostic overlays
* Purposeful map-creation and population-placement workflows rather than disconnected controls
* A consistent person, household/group, settlement, and future polity inspector pattern
* World overview, simulation controls, time-scale controls, event log, and visible seed/tick diagnostics
* Population, needs, activity, and community summary panels that use sampled data rather than per-tick UI work
* A minimap and level-appropriate map controls for very large worlds
* Clear loading, empty, draft, running, paused, and error states
* Accessible keyboard navigation, responsive layout behavior, and cross-browser visual regression coverage

The visual direction may take inspiration from the intended dark, map-first workbench mockup, but must remain an original interface built from the application’s real data and capabilities. Do not add decorative controls for unimplemented systems. New entity categories (groups, cities, towns, kingdoms, and so on) should appear in the UI only when their authoritative domain models exist.

Recommended sequencing:

1. Establish shared layout, navigation, visual tokens, and dependable inspector patterns.
2. Integrate existing world creation, map layers, controls, and diagnostics into that layout.
3. Add real-data overview and analytics panels with explicit empty states.
4. Add future entity views incrementally alongside their simulation milestones.

Acceptance criteria:

* Existing simulation and world-authoring workflows remain fully operable and inspectable.
* The map remains the primary surface and keeps its large-world level-of-detail behavior.
* UI refresh cadence remains decoupled from simulation cadence.
* No UI change alters canonical simulation output or consumes simulation RNG.
* Important interaction paths receive browser-level coverage; visual changes are reviewed at desktop and constrained-width layouts.

---

# Deferred Areas

Unless explicitly promoted into active work, do not proactively implement:

* Detailed hydrology
* Full climate simulation
* Complete ecosystems
* Genetics
* Detailed disease simulation
* Complex agriculture
* Banking
* Financial markets
* Corporations
* Political borders
* Kingdoms
* Warfare
* Detailed religion
* Language
* Technology trees
* Narrative generation
* Multiplayer
* Collaborative editing
* Massive cohort simulation

Deferred systems may influence an architectural boundary only when a current requirement creates a concrete need.

---

# Milestone Completion

A milestone or slice is complete when:

* Its intended behavior works.
* The behavior is observable or inspectable where appropriate.
* Authoritative ownership remains correct.
* Seeded behavior remains reproducible.
* Relevant tests pass.
* Persistence behavior is explicit when affected.
* Version changes are intentional.
* Explanation traces exist where appropriate.
* Performance is acceptable at the intended validation scale.
* Relevant documentation is current.
* Explicit non-goals remain deferred.

Supporting abstractions alone do not make a milestone complete.

---

# Roadmap Maintenance

Update this file when:

* A milestone or slice is completed.
* A milestone is split or reordered.
* A new prerequisite is discovered.
* Deferred work becomes active.
* Future scope materially changes.
* A planned capability is intentionally removed.

Keep this document focused on:

* Status
* Sequencing
* Goals
* Scope
* Dependencies
* Non-goals

Do not place detailed implementation architecture here.

Current implementation belongs in `README.md`.

Development-agent behavior belongs in `AGENTS.md`.

Deep simulation semantics belong in focused design documents.

---

# Current Priority

Completed through:

```text
Milestone 8B.6 — Draft Import and Export
```

Current milestone:

```text
Milestone 8B — Draft Map Authoring
```

Next independently reviewable slice:

```text
Milestone 9 — Environmental and Resource Dynamics
```

Intended immediate sequence:

```text
8B.3 Terrain Painting
  -> 8B.4 Settlement Editing
  -> 8B.5 Roads
  -> 8B.6 Draft Import and Export
  -> 9 Environmental and Resource Dynamics
```

Within 8B.3, prefer the smallest safe editing slice rather than implementing every terrain dimension simultaneously.

The user may explicitly override roadmap priority for any development request.
