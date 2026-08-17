# World Simulation Engine — Roadmap

## Purpose

This roadmap defines the staged development path for the World Simulation Engine.

The project is intentionally built through small, independently reviewable vertical slices.

Each milestone should validate a meaningful portion of the simulation loop before additional complexity is introduced.

The long-term product hypothesis is:

```text
geography and environment
  -> individual exposure and experience
  -> probabilistic behavior and development
  -> social interaction
  -> emergent community conditions
  -> new exposure for current and future people
```

The simulator should eventually support:

- Large worlds
- Large populations
- Long simulation time spans
- Rich social systems
- Emergent communities and societies
- Inspectable individual lives
- Explainable macro-level outcomes

Future systems should not be implemented until existing simulation layers create a concrete need for them.

---

# Roadmap Principles

## Vertical Slices

Each milestone should implement behavior through the complete relevant path.

Typical flow:

```text
domain/configuration
  -> simulation
  -> worker/persistence
  -> projection
  -> UI inspection
  -> tests
```

Not every milestone requires changes to every layer.

However, completed behavior should be observable and testable end to end.

---

## Reproducibility First

Simulation development must preserve deterministic reproducibility for identical:

- Initial state
- Configuration
- Engine version
- World-generator version
- Registry/model versions
- Seed

Simulation-affecting changes must explicitly consider:

- RNG draw ownership
- RNG ordering
- Serialization
- Versioning
- Canonical digests
- Compatibility

---

## Explainability

As the simulator becomes more complex, its behavior must remain inspectable.

Important behavior should retain enough structured evidence to answer questions such as:

- Why did this person choose this action?
- Why did this trait change?
- Why is this community becoming more cooperative?
- Why did this settlement grow?
- Why did this household become resource insecure?
- Why did this institution gain influence?

Complexity should not come at the expense of causal visibility.

---

## Incremental Complexity

Do not introduce high-level societal systems before the mechanisms beneath them exist.

Examples:

```text
individual behavior
    before
institutions

resources and exchange
    before
detailed economics

institutions and collective decisions
    before
government

organized groups and resource conflict
    before
warfare
```

---

# Completed Foundation

# Milestone 0 — Deterministic Simulation Core

Status: Implemented

## Goal

Establish an authoritative simulation engine capable of reproducible execution.

## Implemented Capabilities

- Fixed simulation ticks
- Seeded random number generation
- Named RNG streams
- Snapshot-restorable RNG state
- Canonical authoritative state
- Stable state digests
- Worker-owned execution
- Simulation controls
- Regression testing

## Validated Hypothesis

Probabilistic simulation behavior can remain exactly reproducible when all randomness and state transitions are controlled.

---

# Milestone 1 — Spatial World and Movement

Status: Implemented

## Goal

Make geography a first-class simulation input.

## Implemented Capabilities

- Hex-based world
- Typed spatial coordinates
- Passability
- Neighborhood queries
- Distance calculations
- Agent locations
- Movement
- Travel
- Spatial partitioning
- Spatially aware behavior

## Validated Hypothesis

Where people are located can materially constrain and influence what they can do.

---

# Milestone 2 — Agent Decisions and Actions

Status: Implemented

## Goal

Allow people to make stochastic but reproducible context-dependent decisions.

## Implemented Capabilities

- Opportunity generation
- Action evaluation
- Utility calculation
- Context modifiers
- Seeded probabilistic action selection
- Action execution
- Structured decision traces
- Meaningful events
- Statistics

## Validated Hypothesis

Agents can produce varied outcomes without scripted behavior while remaining explainable and reproducible.

---

# Milestone 3 — Social Encounters and Relationships

Status: Implemented

## Goal

Allow geography and co-location to create persistent social relationships.

## Implemented Capabilities

- Encounter pools based on shared locations
- Avoidance of global O(N²) encounter comparisons
- Familiarity
- Interaction frequency
- Affection
- Trust
- Respect
- Fear
- Probabilistic encounter outcomes
- Relationship updates
- Scheduled decay
- Encounter events
- Social statistics
- Relationship inspection

## Validated Hypothesis

Settlement density and activity patterns can produce different social-network structures.

---

# Milestone 4 — Variable, Trait, and Influence Registries

Status: Implemented

## Goal

Replace hardcoded person behavior parameters with extensible typed registries and sparse influence relationships.

## Initial Person Traits

- Curiosity
- Risk tolerance
- Sociability
- Trust propensity
- Conformity
- Persistence

## Initial States and Needs

- Hunger
- Fatigue
- Social connection

## Implemented Capabilities

- Namespaced variable IDs
- Bounded integer permille storage
- Stable registry ordering
- Versioned registries
- Sparse typed influence edges
- Linear immediate modifiers
- Centralized coefficients
- Structured contribution traces
- Statistical tendency tests
- Invariant tests
- Snapshot compatibility tests

## Validated Hypothesis

An extensible variable system does not require a dense trait-to-trait matrix.

---

# Milestone 5A — Activities and Household Topology

Status: Implemented

## Goal

Give people persistent household structure and recurring location/activity patterns.

## Implemented Capabilities

- Household membership
- Explicit parent-child links
- Home locations
- Shared activity locations
- Adult schedules
- Child schedules
- Travel exclusion from local activity pools
- Aging
- Activity events
- Home/commons/travel statistics
- Household inspection
- Activity overlays
- Household overlays
- Configurable initial curiosity predisposition

## Semantic Boundaries

Household structure remains separate from relationship state.

A parent is not automatically trusted, loved, or socially close merely because household topology identifies them as a parent.

## Validated Hypothesis

Persistent household and activity structure creates meaningful repeated spatial exposure.

---

# Milestone 5B — Exposure, Experiences, and Development

Status: Implemented

## Goal

Create the first mechanism by which repeated lived experience changes a person over time.

## Initial Model

Parent-child curiosity modeling.

## Implemented Capabilities

- Qualifying co-presence exposure
- Parent-child source links
- Bounded exposure windows
- Recipient hours
- Source hours
- Weighted source values
- Structured experiences
- Age-dependent plasticity
- Deterministic developmental changes
- Development traces
- Experience events
- Development statistics

## Semantic Boundaries

Exposure comes from actual qualifying co-presence rather than household membership alone.

Experiences are not traits.

Development does not imply biological inheritance.

## Validated Hypothesis

Repeated exposure can produce gradual deterministic development while retaining a complete explanation trace.

---

# Milestone 6 — Emergent Community Feedback

Status: Implemented

## Goal

Close the first macro-to-micro simulation loop.

## Initial Community Measures

- Social trust
- Cohesion
- Cooperation
- Conflict
- Innovation climate

Structural food security remains separate from emergent social measures.

## Implemented Capabilities

- Geographic catchments
- Daily behavioral evidence
- Fixed-point aggregation
- Contributor traces
- Community events
- Catchment-scoped statistics
- Community feedback into future opportunities

## Feedback Examples

```text
individual interactions
  -> trust evidence
  -> community social trust
  -> future social opportunity evaluation
```

and:

```text
exploratory behavior
  -> innovation evidence
  -> innovation climate
  -> future exploration opportunity evaluation
```

## Semantic Boundaries

People do not have automatic community-membership modifiers.

Community influence derives from geographic exposure and available contextual feedback.

The current conflict measure is not warfare.

## Validated Hypothesis

Aggregated individual behavior can create community conditions that influence later individual behavior.

---

# Milestone 7 — Large-World Rendering and Simulation Scale

Status: Implemented

## Goal

Make visual inspection scale independently from authoritative simulation storage.

## Implemented Capabilities

- Bounded viewport protocol
- Exact local cell projections
- Aligned regional aggregation
- Level-of-detail rendering
- Population marker budgets
- Activity marker budgets
- Household marker budgets
- Relationship segment budgets
- Screen-space marker sizing
- Aggregated population counts
- Aggregated annotations
- Hook-preserving inspection
- Offscreen hooked-person state
- Responsive worker tick quanta
- Independently throttled rendering
- Telemetry flushing
- Non-authoritative viewport caches

## Remaining Scaling Limits

- Dense authoritative world storage
- Population-scale arrays
- Population paging
- Cohort simulation
- Dirty chunk deltas
- OffscreenCanvas
- Parallel simulation

## Validated Hypothesis

World-scale representation and inspection do not require rendering every authoritative entity simultaneously.

---

# Milestone 8A — Reproducible World Creation

Status: Implemented

## Goal

Allow users to configure and create reproducible simulation worlds.

## Implemented Capabilities

- Versioned creation request
- World name
- Seed
- Dimensions
- Fixed physical scale
- Initial population
- Named settlements
- Population-placement zones
- Placement presets
- Seeded terrain generation
- Passability-aware placement
- Variable deterministic household generation
- Worker create/reset contract
- Creation-request persistence
- Settlement projections
- Population-zone projections

## Semantic Boundaries

Settlements are named spatial places.

They do not currently represent:

- Governments
- Political jurisdictions
- Cultural groups
- Economies
- Community membership

## Validated Hypothesis

Users can control macro world parameters without sacrificing deterministic reproduction.

---

# Milestone 8B — Draft Map Authoring

Status: Next

## Goal

Allow users to design and preview a world before committing it to authoritative simulation state.

The authoring model should be:

```text
UI editing tools
  -> worker-owned draft
  -> deterministic draft mutation
  -> bounded preview projection
  -> validation
  -> explicit commit
  -> authoritative simulation
```

A draft must remain separate from the active simulation.

---

## Milestone 8B.1 — Draft World Lifecycle

Status: Implemented

### Goal

Create the architectural boundary for editable pre-simulation worlds without yet implementing a complete map editor.

### Capabilities

- Create draft from creation request
- Create draft from generated preview
- Retain draft independently from authoritative state
- Reset draft
- Cancel draft
- Validate draft
- Commit valid draft into a new simulation
- Expose draft metadata through worker protocol
- Expose bounded draft projection
- Preserve deterministic serialization

### Tests

- Draft creation is deterministic.
- Cancel does not mutate live state.
- Reset reproduces expected draft state.
- Commit creates the expected canonical world.
- Invalid drafts cannot be committed.
- Save/load retains draft identity and content when supported.

### Explicit Non-Goals

- Terrain painting
- Roads
- Hydrology
- Political borders
- Complex editor undo history

### Implemented Boundary

- Versioned, serializable worker-owned draft records
- Deterministic bounded generated previews
- Create, update, reset, discard, hydrate, and explicit commit operations
- Separate IndexedDB draft persistence, distinct from authoritative snapshots
- Revision checks and in-flight UI protection against stale draft commits
- Commit through the existing authoritative world-creation path

Draft previews are summaries only in this slice. A draft map viewport and
editing operations remain later slices.

---

## Milestone 8B.2 — Placement Zone Authoring

Status: Partially Implemented

### Goal

Allow the user to define where populations may initially be placed.

### Implemented 8B.2A — Deterministic Preset Zones

- Add and remove named placement zones
- Retain stable zone IDs across draft edits, reset, persistence, and hydration
- Assign exact population allocations
- Choose west, central, or east deterministic presets and an integer radius
- Optionally associate an independent settlement marker
- Preserve imported/resolved canonical cell IDs without silently changing geometry
- Show per-zone resolved-cell counts only for the currently accepted draft
- Block stale-preview commits and obvious preset overlap before worker updates
- Validate canonical geometry, passability, overlap, anchors, and exact totals in
  the worker before a draft is accepted or committed

### Implemented 8B.2B — Direct Zone Drawing

- Render a bounded non-authoritative draft-map viewport
- Draw and edit explicit zone-cell geometry in that viewport
- Surface worker validation against the specific drawn geometry
- Preview placement effects spatially, rather than only through accepted
  canonical-cell counts

Drawing is restricted to habitable cells in zones without settlement markers.
An explicit apply action sends the complete selection to the worker, which
canonicalizes it and validates it against generated terrain before persisting
the draft. Terrain changes and settlement-anchor movement are deliberately
deferred to their own slices.

### Requirements

Zone geometry must serialize deterministically.

Population allocations must remain exact.

UI geometry must be converted into a canonical worker-owned representation before it can affect authoritative world creation.

---

## Milestone 8B.3 — Terrain Painting

Status: Planned

### Goal

Allow controlled manual modification of generated geography.

### Initial Editing Dimensions

- Terrain type
- Elevation
- Water
- Resource values

### Requirements

Editing operations must:

- Be explicit commands
- Produce deterministic draft state
- Preserve canonical ordering
- Be serializable
- Be inspectable

### Deferred

- Complex brush simulation
- Erosion
- Detailed watersheds
- Dynamic climate
- Full ecology

---

## Milestone 8B.4 — Settlement Editing

Status: Planned

### Goal

Allow users to manually position and identify settlements before simulation starts.

### Capabilities

- Add settlement
- Remove settlement
- Move settlement
- Rename settlement
- Validate location
- Preview settlement placement

### Semantic Boundary

Settlements remain named geographic locations only.

They do not imply governance or social membership.

---

## Milestone 8B.5 — Roads

Status: Planned

### Goal

Add a minimal reproducible transportation structure.

### Initial Capabilities

- Draw road segments
- Delete roads
- Validate connections
- Serialize road geometry
- Display roads at appropriate map levels

### Initial Behavioral Effect

Roads should affect only explicitly implemented systems such as:

- Effective travel cost
- Path preference

Do not automatically introduce:

- Traffic
- Commerce
- Government ownership
- Maintenance
- Toll systems
- Trade

---

## Milestone 8B.6 — Draft Import and Export

Status: Planned

### Goal

Allow authored worlds to be shared and resumed reproducibly.

### Requirements

The draft format must include:

- Format version
- World-generator version
- Physical scale
- Dimensions
- Seed
- Edited terrain
- Placement zones
- Settlements
- Roads
- Other supported authoring data

Imports must:

- Validate schema
- Validate bounds
- Validate model compatibility
- Preserve canonical geometry
- Explicitly reject or migrate incompatible formats

---

# Milestone 9 — Environmental and Resource Dynamics

Status: Planned

## Goal

Make environmental conditions materially affect individual and household behavior.

Begin with simple local resource loops rather than complete ecosystems.

---

## Milestone 9A — Basic Renewable Resource

### Candidate Model

Food availability.

Example loop:

```text
local food resources
  -> household/person access
  -> hunger and food security
  -> consumption
  -> depletion
  -> regeneration
  -> future availability
```

### Capabilities

- Resource quantity per location
- Regeneration
- Consumption
- Resource access
- Local scarcity
- Food-security evidence
- Explainable household effects

### Non-Goals

- Full agriculture
- Commodity markets
- Detailed nutrition
- Plant species
- Farming simulation

---

## Milestone 9B — Seasonal Environment

Status: Planned

### Candidate Capabilities

- Seasons
- Temperature
- Rainfall
- Resource regeneration modifiers
- Travel modifiers
- Environmental suitability

Use deterministic calendar-driven environmental changes unless stochastic weather is explicitly introduced through named RNG streams.

---

## Milestone 9C — Environmental Exposure

Status: Planned

### Goal

Allow where people spend time to determine environmental exposure.

Potential examples:

- Heat
- Cold
- Resource access
- Terrain difficulty
- Water availability

Continue the existing principle of exposure rather than membership.

---

# Milestone 10 — Life Cycle and Population Dynamics

Status: Planned

## Goal

Allow populations and households to change over long time spans.

---

## Milestone 10A — Aging and Life Stages

### Capabilities

- Explicit life-stage transitions
- Age-dependent schedules
- Age-dependent needs
- Developmental plasticity transitions
- Adult independence

Existing aging should be expanded only where new behavior requires it.

---

## Milestone 10B — Mortality

### Initial Model

Start with a simple deterministic/probabilistic mortality model with explicit age-dependent probability and named RNG ownership.

### Requirements

Death must correctly update:

- Household topology
- Relationships
- Activities
- Population indexes
- Persistence
- Statistics
- Inspectors
- References

---

## Milestone 10C — Partnership and Household Formation

### Potential Capabilities

- Partnership formation
- Household merging
- Adult departure from parental home
- Household splitting

Build on actual relationships and interaction history.

Do not create partnerships solely from global matching.

---

## Milestone 10D — Birth and Children

### Potential Capabilities

- Birth
- Parent links
- Household insertion
- Child schedule assignment
- New-person variable initialization
- Stable RNG ownership

### Semantic Boundary

Avoid biological/genetic claims until a dedicated inheritance model exists.

---

# Milestone 11 — Broader Human Development

Status: Planned

## Goal

Expand development beyond the initial curiosity model.

Development should continue to arise from structured experiences.

---

## Candidate Influence Sources

- Parents
- Siblings
- Peers
- Close relationships
- Repeated activities
- Community conditions
- Institutions
- Major life events
- Environmental conditions

---

## Candidate Variable Categories

- Additional traits
- Values
- Attitudes
- Beliefs
- Preferences
- Skills
- Learned behavior

Each category must retain separate semantics.

---

## Milestone 11A — Peer Development

Use repeated social interaction and relationship strength to produce structured social experiences.

Potential targets might include:

- Trust
- Sociability
- Conformity

Introduce only one or two variables initially.

---

## Milestone 11B — Activity-Based Development

Repeated activity participation may produce experiences affecting:

- Persistence
- Skill
- Preference
- Confidence

Skills should probably be modeled separately from traits.

---

## Milestone 11C — Community-to-Person Development

Allow long-running environmental/community exposure to influence person development.

Do not simply copy catchment values into people.

Track duration and intensity of actual exposure.

---

# Milestone 12 — Occupations, Production, and Exchange

Status: Planned

## Goal

Introduce the smallest economy necessary to model production, consumption, and scarcity.

Do not begin with money.

---

## Milestone 12A — Work Roles

### Capabilities

- Work activities
- Work locations
- Occupation/role assignment
- Productive time
- Skill requirements
- Production traces

---

## Milestone 12B — Production and Consumption

### Initial Questions

- Who produces something?
- What resource is required?
- Where is production performed?
- Who consumes the result?
- What happens when production is insufficient?

Start with one or two goods.

---

## Milestone 12C — Exchange

Introduce direct exchange or simple market-like allocation only after ownership/access semantics exist.

Potential inputs:

- Need
- Availability
- Distance
- Relationship
- Exchange value

### Deferred

- Banking
- Stocks
- Corporations
- Financial markets
- Complex currencies

---

# Milestone 13 — Institutions and Organizations

Status: Planned

## Goal

Allow persistent coordinated groups to exist beyond households.

Organizations should emerge from repeated activity and social coordination where practical.

---

## Candidate Institutions

- Schools
- Workplaces
- Community organizations
- Religious organizations
- Trade groups
- Governance bodies

---

## Milestone 13A — Generic Organization Model

Potential capabilities:

- Organization identity
- Location
- Participants
- Roles
- Activities
- Shared rules
- Persistence over time

Membership should not automatically overwrite person beliefs or attitudes.

---

## Milestone 13B — Education Institutions

Schools provide a useful first institution because they naturally integrate:

- Location
- Repeated activity
- Exposure
- Peer relationships
- Development
- Knowledge/skills

---

# Milestone 14 — Culture, Norms, and Beliefs

Status: Planned

## Goal

Model ideas and practices as things transmitted through social mechanisms.

---

## Potential Concepts

- Beliefs
- Norms
- Customs
- Values
- Cultural practices
- Group identity

---

## Transmission Inputs

Potential influences include:

- Exposure
- Trust
- Relationship strength
- Repetition
- Conformity
- Authority
- Institution participation
- Social context

Do not assign a belief to everyone in a community simply because it is common there.

---

# Milestone 15 — Language

Status: Future

## Goal

Model language as a socially transmitted capability and communication constraint.

## Potential Capabilities

- Language knowledge
- Fluency
- Childhood acquisition
- Peer transmission
- Geographic variation
- Communication barriers
- Multilingual people
- Language divergence

Language should derive from social and geographic mechanisms rather than static faction identity.

---

# Milestone 16 — Governance and Politics

Status: Future

## Preconditions

Do not implement governance until meaningful versions of the following exist:

- Communities
- Population dynamics
- Resources
- Organizations
- Social trust
- Cooperation
- Conflict
- Collective activity

---

## Potential Capabilities

- Leadership
- Collective decisions
- Rules
- Authority
- Legitimacy
- Local governance
- Political groups
- Representation
- Territorial jurisdiction

Governance must be distinguishable from geographic settlements and emergent community catchments.

---

# Milestone 17 — Conflict and Warfare

Status: Future

## Goal

Allow organized conflict to arise from previously implemented social, resource, institutional, and political mechanisms.

The existing community `conflict` measure is not warfare.

---

## Potential Prerequisites

- Resource scarcity
- Group identity
- Organizations
- Governance
- Territorial control
- Relationships
- Logistics
- Technology

---

## Potential Progression

```text
interpersonal tension
  -> interpersonal conflict
  -> persistent group conflict
  -> organized violence
  -> warfare
```

Each layer should be modeled independently rather than jumping directly to armies.

---

# Milestone 18 — Technology, Knowledge, and Innovation

Status: Future

## Goal

Model knowledge as something people acquire, preserve, transmit, and apply.

---

## Potential Capabilities

- Knowledge
- Skills
- Discovery
- Experimentation
- Innovation
- Technology adoption
- Teaching
- Knowledge transmission
- Tool availability

---

## Intended Model

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

Allow the simulator to represent populations and worlds beyond the practical limits of fully individualized dense simulation.

Scaling must preserve a clearly defined reproducibility contract.

---

## Candidate Techniques

- Chunked authoritative world storage
- Population paging
- Regional aggregation
- Cohort simulation
- Dynamic simulation fidelity
- Dirty-region updates
- Background aggregate processing
- Worker parallelization
- Multi-worker simulation
- OffscreenCanvas
- Sparse environmental storage

---

## Design Principle

Do not sacrifice individual inspectability without explicitly defining when and how aggregation occurs.

Potential future model:

```text
near / important populations
  -> individual simulation

distant / inactive populations
  -> cohort simulation

relevant transition
  -> deterministic materialization
```

This requires substantial research before implementation.

---

# Milestone 20 — Historical Inspection

Status: Future

## Goal

Allow users to understand what happened across long simulated time spans.

---

## Potential Capabilities

- Person timelines
- Household histories
- Settlement histories
- Community histories
- Population charts
- Geographic change over time
- Major-event detection
- Causal drill-down
- Historical snapshots
- Time-lapse maps

The history layer should summarize authoritative simulation evidence rather than invent events.

---

# Milestone 21 — Optional Narrative Presentation

Status: Future / Optional

## Goal

Potentially provide narrative summaries of simulation history without making generative AI part of simulation behavior.

If generative AI is ever used:

```text
authoritative simulation history
  -> deterministic structured records
  -> optional external narrative presentation
```

AI-generated text must remain:

- Non-authoritative
- Replaceable
- Optional
- Separate from state evolution
- Separate from canonical digests

The simulation must remain fully functional and understandable without generative AI.

---

# Explicitly Deferred Areas

Unless promoted into an active milestone, do not proactively implement:

- Detailed hydrology
- Full climate simulation
- Complete ecosystems
- Genetics
- Detailed disease simulation
- Complex agriculture
- Banking
- Financial markets
- Corporations
- Political borders
- Kingdoms
- Warfare
- Detailed religion
- Language
- Technology trees
- Narrative generation
- Multiplayer
- Collaborative world editing
- Massive cohort simulation

These areas may inform current architectural boundaries only when a concrete requirement requires it.

---

# Milestone Completion Criteria

A milestone is complete when:

- Its core behavioral hypothesis is testable.
- Behavior is inspectable end to end.
- Authoritative simulation ownership remains outside the UI.
- Seeded execution remains reproducible.
- Relevant tests pass.
- Persistence behavior is explicit.
- Version changes are intentional.
- Explanation traces exist where appropriate.
- Performance remains acceptable at the milestone's intended validation scale.
- Documentation reflects implemented behavior.
- Explicit non-goals remain deferred.

A milestone is not complete solely because supporting abstractions exist.

The intended behavior must actually work.

---

# Roadmap Change Rules

Update this file when:

- A milestone is completed.
- A milestone is split into smaller slices.
- Planned sequencing changes.
- New prerequisites are discovered.
- Deferred scope is promoted into active work.
- A system is intentionally removed from the roadmap.

Do not place detailed implementation notes here unless they materially affect future sequencing.

Current architecture belongs in `README.md`.

Development-agent rules belong in `AGENTS.md`.

---

# Current Priority

Completed:

```text
Milestones 0–8B.2B
```

Current milestone:

```text
Milestone 8B — Draft Map Authoring
```

Next independently reviewable slice:

```text
Milestone 8B.3 — Terrain Painting
```

The intended immediate sequence is:

```text
8B.3 Terrain Painting
  -> 8B.4 Settlement Editing
  -> 8B.5 Roads
  -> 8B.6 Draft Import/Export
```

The user may explicitly override roadmap priority for any individual development request.
