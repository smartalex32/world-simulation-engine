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

Completed post-23 implementation history remains in [POST_23_ROADMAP.md](POST_23_ROADMAP.md).
This document is the sole authority for current and future milestone sequencing.

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
* Milestone 9 — Environmental and Resource Dynamics
* Milestone 10 — Life Cycle and Population Dynamics
* Milestone 11 — Broader Human Development
* Milestone 12 — Occupations, Production, and Exchange
* Milestone 13 — Institutions and Organizations
* Milestone 14 — Culture, Norms, and Beliefs
* Milestone 15 — Language
* Milestone 16 — Governance and Politics
* Milestone 17 — Conflict and Warfare
* Milestone 18 — Technology, Knowledge, and Innovation
* Milestone 19 — Massive Simulation Scale
* Milestone 20 — Historical Inspection
* Milestone 21 — Optional Narrative Presentation
* Milestone 22 — Simulation Workbench Experience
* Milestone 23 — Settlement Profiles
* Milestone 24 — Settlement Catchments and Inspection
* Milestone 25 — Water, Routes, and Geographic Accessibility
* Milestone 26 — Household Relocation and Settlement Change
* Milestone 27 — Local Goods and Exchange Places
* Milestone 28 — Settlement Services and Institutions
* Milestone 29 — Regional Routes and Inter-Settlement Networks
* Milestone 30 — Spatial Cultural and Language Diffusion
* Milestone 31 — Territorial Governance and Civic Legitimacy
* Milestone 32 — Collective Conflict and Resolution
* Milestone 33 — Seasonal Climate, Agriculture, and Ecology
* Milestone 34 — Health, Disease, and Demographic Stress
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

## Next Slice

* Milestone 51 — Persistence Compatibility and Deterministic Portability

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

Status: Implemented

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

Implemented: people hold bounded fluency in two initial geographic language varieties. Shared fluency changes encounter outcome weights, and children can acquire additional fluency only through real positive encounters. Language state is separate from culture, traits, and community membership.

---

# Milestone 16 — Governance and Politics

Status: Implemented (local governance foundation)

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

Implemented: each community has a separate, persistent local council record with deterministic adult representatives and an inspectable legitimacy score derived daily from observed social trust, cooperation, and conflict. This creates no nation, political party, territorial jurisdiction, or automatic personal belief change.

---

# Milestone 17 — Conflict and Warfare

Status: Implemented (interpersonal conflict foundation)

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

Implemented: tense encounters can create or escalate a persistent, inspectable interpersonal dispute with grievance, incident count, last incident time, and local community context. This is explicitly not combat, organized violence, a military unit, or warfare.

---

# Milestone 18 — Technology, Knowledge, and Innovation

Status: Implemented (knowledge foundation)

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

Implemented: people now carry a versioned, bounded knowledge record distinct from variables and skills. Exploration deterministically produces local-terrain knowledge based on the actor's curiosity. Positive co-present encounters can transmit a bounded portion of a meaningful knowledge gap using the existing directional relationship trust as evidence of receptiveness. Foraging knowledge applies as a capped harvest-yield multiplier. Discovery and transmission create inspectable traces and meaningful events, and knowledge is snapshot-validated.

Deferred: skill registry, experimentation projects, inventions, technology adoption, tools, and a global technology tree.

---

# Milestone 19 — Massive Simulation Scale

Status: Implemented (bounded inspection transport foundation)

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

Implemented: the workbench projection now has explicit bounded inspector-detail transport. Large views retain exact aggregate population and map counts while sending a deterministic local person set rather than every person, relationship, household, and parent-child record. A hooked person and their household remain prioritized for live inspection, and the projection explicitly reports truncated detail. This does not alter authoritative simulation fidelity, state, RNG, or canonical output.

Deferred: chunked authoritative state, world paging, cohorts, fidelity transitions/materialization, worker parallelization, and OffscreenCanvas. These require measured workload targets and a fuller reproducibility design.

---

# Milestone 20 — Historical Inspection

Status: Implemented (evidence history foundation)

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

Implemented: IndexedDB now exposes bounded, indexed reads of persisted meaningful events and selected world statistic series. The History workspace displays exact selected-person event participation, explicit major-event highlights, and world population/resource/social trends. Historical person inspection hooks the person through the existing bounded projection path without moving the camera or changing the simulation.

Deferred: dedicated household, settlement, and community history views; historical snapshot comparison; time-lapse maps; geographic-change history; and richer causal drill-down. These require additional authoritative evidence or a deliberate retained-snapshot policy rather than UI inference.

---

# Milestone 21 — Optional Narrative Presentation

Status: Implemented (deterministic template presentation)

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

Implemented: the History workspace includes an optional deterministic chronicle. It presents selected categories of already-recorded significant events through fixed local templates and exposes the exact evidence event ID. It does not call an AI service, generate new simulation facts, mutate state, use simulation RNG, or participate in canonical digests.

Deferred: any generative-AI narrative layer. If ever introduced, it must remain user-invoked, replaceable, strictly non-authoritative, and downstream of the existing structured evidence history.

---

# Milestone 22 — Simulation Workbench Experience

Status: Implemented (map-first presentation foundation)

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

Implemented: the workbench now has coherent world, simulation, analytics, entities, history, tools, and settings navigation. Its map layer and annotation controls remain functional from the relevant workspaces, Tools links directly to worker-owned world creation, and Settings exposes real presentation diagnostics without false simulation controls. The existing map-first layout, worker-owned controls, live inspectors, sampled aggregate panels, seed/tick diagnostics, level-of-detail rendering, and responsive desktop/constrained-width rules have been consolidated and covered by browser interaction tests.

Deferred: visual-regression screenshot baselines, a richer minimap, and additional entity inspectors. These require either a stable visual-review process or authoritative entity models beyond the currently implemented domains.

---

# Milestone 23 — Settlement Profiles

Status: Implemented (nearby-home scale foundation)

## Goal

Make authored geographic settlement anchors legible as real places without turning them into a premature demographic, cultural, governmental, or political membership system.

Implemented: the projection derives a deterministic landmark, hamlet, village, town, or city display scale from the number of living people whose homes are within four hexes of each settlement anchor. The workbench exposes the nearby resident and occupied-home-cell counts in the entity list, and the map labels include the derived scale. This is a read-only projection rule: it neither adds a person settlement field nor affects simulation rules, RNG, snapshots, or canonical digests.

Deferred: settlement boundary/catchment authoring, markets, institutions tied to settlement locations, settlement histories, actual civic membership, urban growth mechanics, cities as distinct authoritative entities, and any kingdoms or political borders. Those require their own explicit spatial and social semantics.

---

# Active and Future Roadmap

The next three milestones deliberately strengthen the engineering foundation
before large-world authoring resumes. Later milestones may contain several
closely related tasks, but each must still produce one coherent, testable
capability.

## Milestone 50 — Hosted Authority and Background-Job Correctness

**Status:** Implemented

**Goal:** Make the server-owned run and background-job foundations safe under
concurrency, cancellation, failure, and restart.

Implement:

* One per-run coordinator and exactly one active authoritative advancement
  operation per run.
* A durable FIFO job queue whose completed jobs advance the world by the sum of
  their requested ticks.
* Explicit `queued`, `running`, `cancelling`, `cancelled`, `completed`, and
  `failed` states with committed tick/digest and sanitized failure evidence.
* Immediate queued-job cancellation and deterministic running-job cancellation
  at quantum boundaries.
* Reconciliation from the job's committed tick/digest rather than an
  unqualified global-tick delta.
* In-flight catalog-open deduplication and a per-run mutation lock.
* Runtime validation for run, job, and checkpoint records.
* Handled background failures, bounded request bodies, accurate HTTP status
  codes, configurable binding, and authenticated job operations.

Acceptance requires concurrent-job, concurrent-open, cancellation, injected
storage failure, corrupt-record, and restart-at-every-commit-boundary tests.

**Delivered boundary:** Each host run has one catalog-coordinated service and
one FIFO job manager. Jobs use a durable write-ahead quantum plus committed
tick/digest, recover only a matching interrupted quantum, and fail explicitly
when the authoritative run changes outside the queue. Queued cancellation is
immediate; running cancellation resolves at the next quantum boundary. Run/job
records are validated on every store boundary. The HTTP transport has bounded
JSON bodies, sanitized status errors, configurable bind host, and rejects
interactive mutation while a job owns advancement. Job record version 1 is
rejected explicitly; rolling compatibility begins in Milestone 51.

**Non-goals:** Distributed execution, multiple authoritative hosts, public API
stability, and collaboration.

## Milestone 51 — Persistence Compatibility and Deterministic Portability *(implemented)*

**Goal:** Keep valuable worlds recoverable across releases and reproducible
across supported runtimes.

Implement:

* An explicit migration registry supporting the three most recent released
  snapshot schemas, applied one version at a time with validation after every
  step.
* Original-save backup retention until migration commits successfully.
* Equivalent versioned validation for hosted runs, jobs, checkpoints, drafts,
  and import bundles.
* Transactional import with event/statistic shape, ownership, tick, metric, and
  payload validation.
* One locale-independent binary identifier comparator for all authoritative
  ordering and tie-breaking.
* Rejection and timeout of pending worker requests on worker crash or disposal.
* Node, Chromium, Firefox, and WebKit golden-digest checks at meaningful
  long-run checkpoints.

Delivered boundary: schemas 30, 31, and 32 use an explicit one-step migration
registry before the existing full snapshot validation. The historical schemas
share the current state shape, so their migrations are intentionally structural
version transitions rather than silent state reinterpretation. Snapshot worker
requests now reject on timeout, worker crash, or disposal, and hosted record
lists use a locale-independent identifier comparator. Broader cross-runtime
golden fixtures and transactional bundle telemetry imports remain the next
compatibility slice when actual schema/model migrations require them.

**Non-goals:** Indefinite compatibility with every pre-release schema or silent
reinterpretation of incompatible state.

## Milestone 52 — Maintainability and Performance Foundation

**Goal:** Reduce change risk and remove current full-state projection work
without changing simulation behavior.

Implement:

* A small simulation orchestrator delegating to owned hourly, daily,
  developmental, lifecycle, economy, organization, encounter, and community
  systems.
* Focused application controllers for simulation session, persistence,
  world-draft authoring, selection, and history, with presentational panels kept
  separate.
* Separate static-geography, population-index, inspector-detail, route, and
  regional-aggregate projection modules.
* Maintained spatial/population indexes so routine viewport requests do not
  repeatedly scan every detailed person.
* Shared validation, stable-ordering, hosted-ID, and structured-error helpers.
* Explicit browser and hosted typecheck steps in CI.

This milestone is behavior-preserving: canonical digests, snapshot fixtures,
worker contracts, and user workflows must remain unchanged. Acceptance requires
projection-equivalence tests, full browser coverage, and measured non-regression
at 10,000 detailed people. Later milestones reserve refactoring capacity for
every oversized module they touch.

## Milestone 53 — Designed Landmass and Regional Map Authoring

**Goal:** Author very large fictional geographies without dense allocation.

Implement sparse hierarchical chunks, configurable physical cell scale, local
fine-detail editing, terrain, water, elevation, coastlines, resources, bounded
streaming previews, deterministic generation, import/export, and draft undo.
Regional and world zoom use continuous/aggregate geography without visible
hexes. Detailed hydrology remains Milestone 54.

First delivered slice: configurable 100 m–10 km physical hex radius is an
explicit authored world input, validated and persisted without changing the
legacy 1 km default. Sparse hierarchical chunks, streamed previews, and undo
remain subsequent slices of this milestone.

## Milestone 54 — Regional Environment, Hydrology, Climate, and Ecology

Add deterministic drainage, rivers, lakes, watersheds, regional climate,
biomes, renewable resources, and regionally appropriate ecological fidelity.
Authored overrides remain distinct from generated state. Environment affects
people and settlements only through measurable access, exposure, production,
hazard, and opportunity.

First delivered slice: exact-cell inspection derives a stable, acyclic
strictly-downhill drainage graph from authored elevation. It exposes flow and
terminal basin evidence without mutating terrain or applying environmental
effects to people. Lakes, filled depressions, rivers, climate expansion, and
ecology remain separate follow-up slices.

## Milestone 55 — Settlement Seeds and Starting Population Placement

Allow authors to place homestead, hamlet, village, town, and city seeds; choose
placement areas and population totals; and configure household and trait
distributions. Support 100,000+ starting people through explicit detailed-local
and cohort-distant allocation. Preview capacity, access, density, and travel
before commit. Settlement association remains separate from exposure and civic
membership.

The first delivered slice adds those five explicit, deterministic seed profiles
to the bounded world creator, with profile guidance and pre-commit evidence for
eligible homes, people-per-home density, renewable resource capacity per
resident, and axial travel to a marker. The interactive creator remains capped
at 500 detailed people; the 100,000+ detailed-local/cohort allocation boundary
belongs to Milestone 56 and must not be implied by a city profile alone.

## Milestone 56 — Regional Population Cohorts

Add authoritative, versioned cohorts for distant ordinary populations while
retaining important and hooked people in full detail. Preserve exact population,
age, household, resource, migration, trait-distribution, and event totals. Every
aggregate decision and rounding residual remains inspectable.

The first delivered slice adds a versioned, authoritative static cohort ledger
for explicitly authored distant people. A placement zone may retain up to 500
detailed people while assigning up to one billion ordinary people to a cohort.
The cohort preserves exact zone, cell allocation, population, household, food,
age-band, and birth/death/migration totals; it contributes to canonical
population and map counts without consuming RNG or materializing people.
Lifecycle advancement, trait distributions, cohort decisions, and transitions
to detailed people remain intentionally deferred to Milestones 57–58.

## Milestone 57 — Fidelity Materialization and Dematerialization

Deterministically materialize cohorts into detailed people when a region is
focused and reconcile them back without losing totals, important relationships,
or history. Persist transition seeds, inputs, outputs, rounding, and residuals.
Never dematerialize hooked, historically important, or explicitly protected
people.

The first delivered slice adds a deterministic, read-only materialization plan
for each cohort request. It reports requested, available, materializable, and
residual totals with canonical cell allocations; protected detailed identities
block automatic conversion rather than being silently dropped. The workbench
also exposes cohort evidence and a ready/empty transition status. No person is
created, removed, or changed in this planning slice.

## Milestone 58 — Settlement Growth, Decline, and Regional Migration

Derive reversible homestead-to-city transitions from real population, occupied
homes, resources, services, accessibility, and density. Use hysteresis to avoid
scale oscillation. Model household movement, births, deaths, abandonment,
resettlement, and regional migration with inspectable contributing factors.

The first delivered slice retains a settlement's geographic scale and evaluates
it monthly from nearby living homes, catchment resource capacity, and water
access. A 20% lower-population hysteresis buffer prevents boundary oscillation;
every scale change is emitted with explicit population, density, resource, and
access evidence. Existing lifecycle and household relocation systems remain the
only population/movement authorities. Service capacity, abandonment,
resettlement, and inter-settlement migration remain later slices rather than
being implied by the scale label.

## Milestone 59 — World History at Regional Scale ([Issue #63](https://github.com/smartalex32/world-simulation-engine/issues/63))

Retain bounded settlement, cohort, migration, environment, and fidelity-change
evidence. Add regional comparisons, settlement timelines, change maps, and
causal drill-down. Time-lapse views use retained evidence without mutating or
silently replaying the active run.

First delivered slice: retained checkpoints now preserve detailed/cohort
population, cohort households, available food, and settlement scale/household
store evidence. The History workspace compares only those checkpoints, showing
regional detailed-versus-cohort and food deltas plus settlement scale changes.
This is a bounded, read-only comparison surface; migration, environment, and
fidelity timelines require their corresponding authoritative events first.

## Milestone 60 — Workbench UI Convergence ([Issue #64](https://github.com/smartalex32/world-simulation-engine/issues/64))

Move the application toward the intended map-first product surface: coherent
World, Simulation, Analytics, Entities, History, Tools, and Settings workspaces;
modular overview/map/inspector/history regions; minimap and layers; responsive
and accessible layouts; and entity navigation for people, households, groups,
settlements, regions, institutions, and polities only when authoritative models
exist. Hooking a person never forces camera follow. UI-impacting PRs include
review screenshots in the PR, not the repository.

## Milestone 61 — Infrastructure, Services, and Trade Networks ([Issue #65](https://github.com/smartalex32/world-simulation-engine/issues/65))

Extend roads, rivers, ports, markets, schools, storage, and public services into
regional networks with capacity, maintenance, accessibility, and disruption.
Settlement service levels derive from real institutions and infrastructure.

## Milestone 62 — Regional Economy, Labor, Wealth, and Inequality ([Issue #66](https://github.com/smartalex32/world-simulation-engine/issues/66))

Add occupations, production chains, goods, prices, trade flows, household
wealth, ownership, labor, scarcity, and inequality. Money, goods, ownership,
labor, and institutional resources remain semantically distinct.

## Milestone 63 — Groups, Associations, Institutions, and Factions ([Issue #67](https://github.com/smartalex32/world-simulation-engine/issues/67))

Add explicit groups with membership, roles, goals, resources, reputation, and
internal relationships. Typed specializations may include guilds, councils,
religious organizations, and political factions, but shared activity and social
evidence—not arbitrary labels—create or strengthen them.

## Milestone 64 — Territorial Governance and Polity Formation ([Issue #68](https://github.com/smartalex32/world-simulation-engine/issues/68))

Add explicit settlements, regions, cities, city-states, kingdoms, and other
polities. Keep territory, jurisdiction, civic membership, culture, and identity
separate. Polities may form, merge, fragment, expand, contract, and disappear
through inspectable demographic, institutional, legitimacy, and territorial
processes.

## Milestone 65 — Law, Public Finance, and State Capacity ([Issue #69](https://github.com/smartalex32/world-simulation-engine/issues/69))

Add laws, taxation, budgets, administration, public works, enforcement,
legitimacy, corruption, and institutional effectiveness. Compliance emerges
through incentives, exposure, beliefs, relationships, and enforcement rather
than a direct polity-membership modifier.

## Milestone 66 — Culture, Religion, Language, and Collective Identity ([Issue #70](https://github.com/smartalex32/world-simulation-engine/issues/70))

Extend existing culture and language foundations into traditions, values,
belief institutions, rituals, identities, and cultural boundaries. Transmission
occurs through households, peers, schools, organizations, travel, prestige, and
real contact. Religion, culture, language, identity, and polity membership
remain distinct.

## Milestone 67 — Diplomacy, Organized Conflict, and Warfare ([Issue #71](https://github.com/smartalex32/world-simulation-engine/issues/71))

Build alliances, claims, mobilization, military organizations, logistics,
conflict, occupation, diplomacy, and peace on the polity and economic systems.
Record casualties, displacement, trauma, territorial change, and long-term
social effects. No aggression threshold may create an abstract instant war.

## Milestone 68 — Technology, Knowledge, and Innovation Diffusion ([Issue #72](https://github.com/smartalex32/world-simulation-engine/issues/72))

Extend practical experimentation into inventions, tools, techniques, education,
adoption, and diffusion. Innovation depends on knowledge, resources,
institutions, incentives, communication, and successful experimentation rather
than a universal linear technology tree.

## Milestone 69 — Generational Society Feedback ([Issue #73](https://github.com/smartalex32/world-simulation-engine/issues/73))

Complete the household/community/development loop across generations. Childhood
development combines configured inheritance, household behavior, peers,
institutions, environment, community conditions, and structured experiences.
Multi-generation explanations show how developed adults change the environment
experienced by later children.

## Milestone 70 — Civilization-Scale Validation and Product Completion ([Issue #74](https://github.com/smartalex32/world-simulation-engine/issues/74))

Validate long-running worlds across geography, cohorts, settlements, polities,
economies, cultures, technology, conflict, and generations. Complete scenario
comparison, reproducibility audits, performance budgets, recovery, migrations,
analytics, import/export, diagnostics, and production-readiness documentation.
This is an integration milestone, not a place to introduce major new systems.

---

# Cross-Cutting Acceptance Policy

* One independently reviewable branch and PR per milestone.
* `pnpm typecheck`, hosted typecheck, unit tests, build, E2E tests, and GitHub
  verification pass before merge.
* Simulation changes include fixed-seed, invariant, controlled-scenario,
  statistical, snapshot, and explanation coverage as applicable.
* Scaling changes include measured budgets at 10,000 detailed people, 100,000+
  mixed-fidelity people, and sparse large-world fixtures.
* UI changes include cross-browser, constrained-width, accessibility, and PR
  screenshot evidence.
* Persistence changes explicitly migrate or reject incompatible data.
* Supporting abstractions alone do not complete a milestone.

---

# Deferred Until Their Milestone

Do not pull later systems into earlier work merely because they are now
numbered. Detailed hydrology, cohorts, polities, kingdoms, warfare, religion,
regional economics, technology diffusion, and civilization-scale behavior
remain deferred until their listed prerequisites are complete. Genetics,
clinical disease modeling, generative narrative, multiplayer authority, and
collaborative editing remain unplanned unless explicitly promoted later.

---

# Roadmap Maintenance

Update this file when a milestone completes, splits, reorders, or discovers a
new prerequisite. Keep current architecture in `README.md`, development rules
in `AGENTS.md`, and deep simulation semantics in focused design documents.

Every planned milestone must have a corresponding GitHub issue linked directly
from its heading. Treat this file as the source of truth: when adding a
milestone, create and link its issue; when changing scope, title, sequencing,
or status, update the matching issue; and when removing a milestone, delete its
matching issue. Do this in the same change/PR as the roadmap update.

Current priority:

```text
Milestone 51 — Persistence Compatibility and Deterministic Portability
```

The user may explicitly override roadmap priority for any development request.
