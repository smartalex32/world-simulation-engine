# World Simulation Engine — Consolidated Roadmap

## Purpose

This file is the sole source of truth for milestone status, delivered scope,
remaining scope, sequencing, and roadmap traceability.

The product mission is to build an explainable, reproducible, spatial,
stochastic agent-based world simulator around this loop:

```text
geography and environment
  -> individual exposure and experience
  -> probabilistic behavior and development
  -> social interaction
  -> emergent community conditions
  -> new exposure for current and future people
```

The long-term product direction includes large worlds, large populations, long
time spans, inspectable individual lives, emergent societies, and explainable
macro-level outcomes. A milestone title names that broader destination; its
status states how much of that destination has actually been delivered.

## Authority and Archives

`docs/ROADMAP.md` is authoritative. Current status must not be inferred from a
branch name, issue title, merged pull request, archive, README summary, or the
highest milestone number that has received a change.

Historical roadmap documents are preserved for implementation history only:

* [Pre-consolidation roadmap](archive/PRE_CONSOLIDATION_ROADMAP.md)
* [Post-23 roadmap archive](archive/POST_23_ROADMAP.md)
* [Post-46 roadmap archive](archive/POST_46_ROADMAP.md)

Archives may retain the status language used when they were written. That
language is historical and does not override this consolidated ledger.

## Status Vocabulary

Every milestone uses one of these goal statuses:

* **Complete** — the milestone's bounded written goal and acceptance boundary
  are satisfied. Later milestones may deepen the same theme without reopening
  this milestone.
* **Foundation complete** — the deliberately bounded historical slice is
  complete, but the milestone title describes a broader capability that is not
  complete. Later milestones own that broader work.
* **In progress** — at least one implementation slice has merged, but material
  parts of the milestone's current written goal remain unresolved.
* **Design complete** — an approved design or authority boundary exists, but
  the user-facing or authoritative feature is not implemented.
* **Planned** — the goal is defined but no qualifying implementation slice has
  merged.
* **Deferred / unplanned** — the capability is intentionally outside the active
  roadmap until explicitly promoted.

A pull request has a separate **delivery status**. Merging a PR proves that a
slice was delivered; it does not by itself make the milestone goal complete.
Milestone completion requires the status in this file to change explicitly and
the remaining-scope statement to be empty or moved to a later named milestone.

## Current Product Status

The deterministic individual/community simulation foundation is substantial,
tested, and usable. Milestones 0–15 completed their bounded goals. Milestones
16–50 delivered increasingly broad foundations, with Milestone 39 remaining a
design-only collaboration boundary.

Milestones 51–70 have each received at least one merged implementation slice.
They are not all goal-complete. Their delivered slices intentionally leave
substantial persistence, maintainability, sparse-world, cohort-transition,
regional-society, polity, economy, culture, conflict, technology, generational,
and product-validation work unresolved.

Milestone 70 therefore means that the first civilization integration audit is
available. It does not currently mean that the civilization-scale product is
complete.

No next implementation priority is selected by this consolidation. Sequencing
and next-step planning will be handled separately.

# Consolidated Milestone Ledger

## Completed and Historical Foundations

The historical milestones below are closed at the stated boundary. A
**Foundation complete** row must not be read as completion of the entire theme
named in its title.

| Milestone | Goal status | Consolidated delivered boundary |
| --- | --- | --- |
| 0 — Deterministic Simulation Core | Complete | Fixed-hour engine, centralized seeded RNG streams, deterministic snapshots, digests, events, and statistics. |
| 1 — Spatial World and Movement | Complete | Deterministic axial world, passability, movement costs, bounded pathfinding, location, and travel. |
| 2 — Agent Decisions and Actions | Complete | Available-action evaluation, structured utility explanations, seeded stochastic resolution, and action execution. |
| 3 — Social Encounters and Relationships | Complete | Spatially bounded encounters, persistent typed relationship dimensions, and inspectable social outcomes. |
| 4 — Variable, Trait, and Influence Registries | Complete | Versioned person-variable storage and explicit sparse influence definitions with explanation traces. |
| 5A — Activities and Household Topology | Complete | Household membership, parent-child topology, activity locations, schedules, and exposure-producing activity. |
| 5B — Exposure, Experiences, and Development | Complete | Structured exposure windows, experiences, age-dependent development, traces, and deterministic application. |
| 6 — Emergent Community Feedback | Complete | Geographic catchments, emergent and structural measures, contributor traces, and bounded macro-to-micro feedback. |
| 7 — Large-World Rendering and Simulation Scale | Complete | Bounded projections, map levels of detail, aggregate rendering, and rendering/simulation separation for the then-supported dense world. |
| 8A — Reproducible World Creation | Complete | Versioned creation requests, deterministic generation, explicit placement, validation, and reproducible household generation. |
| 8B.1 — Draft World Lifecycle | Complete | Worker-owned drafts, revisions, preview, persistence, reset, discard, and explicit commit. |
| 8B.2A — Deterministic Preset Placement Zones | Complete | Named preset zones with stable IDs, exact allocation, deterministic resolution, and overlap/passability validation. |
| 8B.2B — Direct Placement-Zone Drawing | Complete | Bounded direct cell selection with worker validation, explicit apply, and persisted canonical geometry. |
| 8B.3A — Terrain-Type Painting | Complete | Sparse canonical plain, hill, and water overrides through the worker-owned draft. |
| 8B.3B — Elevation Painting | Complete | Controlled absolute elevation overrides with coherent terrain-derived values. |
| 8B.3C — Water Editing | Complete | Explicit water painting through the terrain-type command with passability validation. |
| 8B.3D — Resource Painting | Complete | Explicit bounded renewable-resource capacity overrides. |
| 8B.4 — Settlement Editing | Complete | Named geographic settlement anchors with validation and projection. |
| 8B.5 — Roads | Complete | Authored, contiguous, passable road geometry with real movement-cost effects. |
| 8B.6 — Draft Import and Export | Complete | Versioned draft bundles with validation and explicit incompatibility rejection. |
| 9A — Basic Renewable Resource | Complete | Renewable food capacity, depletion, and deterministic regeneration. |
| 9B — Seasonal Environment | Complete | Four-season deterministic calendar effects on regeneration and movement evaluation. |
| 9C — Environmental Exposure | Complete | Person-owned counters derived from actual occupied-cell food, terrain, and thermal exposure. |
| 10 — Life Cycle and Population Dynamics | Complete | Life stages, mortality, partnership/household formation, births, parent links, and inheritance traces. |
| 10A — Life Stages | Complete | Explicit infant, child, adolescent, adult, and older-adult transitions. |
| 10B — Mortality | Complete | Named-stream age-banded mortality with retained dead-person identity and history. |
| 10C — Partnership and Household Formation | Complete | Relationship-evidence-based partnership and deterministic household merging. |
| 10D — Birth and Children | Complete | Annual birth opportunities, new stable identities, parent links, and inheritance/development state. |
| 11 — Broader Human Development | Complete | Parent, peer, activity, and community exposure channels with inspectable developmental changes. |
| 11A — Peer Development | Complete | Relationship-attenuated monthly peer modeling from resolved encounters. |
| 11B — Activity-Based Development | Complete | Exploration-practice experiences that can develop persistence. |
| 11C — Community-to-Person Development | Complete | Actual catchment exposure can produce low-plasticity trust, conformity, and curiosity development. |
| 12 — Occupations, Production, and Exchange | Complete | First bounded economy: three roles, food production/consumption, household stores, scarcity, and relationship-gated food sharing. |
| 12A — Work Roles | Complete | Forager, household, and dependent roles with inspectable productive action. |
| 12B — Production and Consumption | Complete | Whole-unit food production, household ownership, consumption, and scarcity evidence. |
| 12C — Exchange | Complete | Deterministic relationship-gated household food sharing that preserves totals. |
| 13 — Institutions and Organizations | Complete | Generic persistent organization records proven through a location-bound school specialization. |
| 13A — Generic Organization Model | Complete | Persistent identity, kind, location, roles, capacity, rules, and membership records. |
| 13B — Education Institutions | Complete | Fixed-capacity schools with route-, household-, and trait-aware attendance evidence. |
| 14 — Culture, Norms, and Beliefs | Complete | First person-owned learned beliefs transmitted through qualifying real social exposure. |
| 15 — Language | Complete | First person-owned language fluencies, communication effects, and exposure-based acquisition. |
| 16 — Governance and Politics | Foundation complete | Local council records, representatives, food-relief service, and legitimacy evidence; not territorial politics or state government. |
| 17 — Conflict and Warfare | Foundation complete | Persistent interpersonal disputes and local contention evidence; not collective violence or warfare. |
| 18 — Technology, Knowledge, and Innovation | Foundation complete | Person-owned knowledge, trusted transmission, practical experimentation, and bounded technique use; not a technology system. |
| 19 — Massive Simulation Scale | Foundation complete | Bounded inspector transport and exact projection aggregation; authoritative people remained fully detailed. |
| 20 — Historical Inspection | Foundation complete | Bounded events, metrics, person timelines, and causal evidence inspection. |
| 21 — Optional Narrative Presentation | Complete | Deterministic templates over retained evidence with no authoritative or generative-AI behavior. |
| 22 — Simulation Workbench Experience | Foundation complete | Coherent map-first workbench modes, controls, diagnostics, responsive layout, and real inspectors. |
| 23 — Settlement Profiles | Foundation complete | Read-only settlement scale derived from nearby homes; not settlement membership or urban dynamics. |
| 24 — Settlement Catchments and Inspection | Foundation complete | Authored bounded catchments and geographic settlement inspection. |
| 25 — Water, Routes, and Geographic Accessibility | Foundation complete | Road discounts, water access, and route evidence grounded in authored geography. |
| 26 — Household Relocation and Settlement Change | Foundation complete | Bounded monthly household relocation with inspectable material and social factors. |
| 27 — Local Goods and Exchange Places | Foundation complete | Location-bound markets and bounded co-present durable-tool exchange. |
| 28 — Settlement Services and Institutions | Foundation complete | Route- and capacity-aware school access tied to real settlement geography. |
| 29 — Regional Routes and Inter-Settlement Networks | Foundation complete | Read-only deterministic route/accessibility projection between settlements. |
| 30 — Spatial Cultural and Language Diffusion | Foundation complete | Culture and language observation through real co-attendance and contact. |
| 31 — Territorial Governance and Civic Legitimacy | Foundation complete | Local food-relief legitimacy evidence; no legal territory or civic membership. |
| 32 — Collective Conflict and Resolution | Foundation complete | Bounded community contention and non-lethal local resolution evidence. |
| 33 — Seasonal Climate, Agriculture, and Ecology | Foundation complete | Static terrain/elevation climate classes with seasonal resource and agricultural effects. |
| 34 — Health, Disease, and Demographic Stress | Foundation complete | Fictional daily health stress from co-presence, crowding, water, and hunger; no pathogen model. |
| 35 — Skills, Experimentation, and Practical Innovation | Foundation complete | First seeded foraging experiment and person-owned practical technique. |
| 36 — Historical Snapshots and Causal Replay | Foundation complete | Bounded checkpoints and read-only retained-state comparison; no mutating replay. |
| 37 — Scalable Authoritative Simulation | Foundation complete | First measured allocation/index optimization with unchanged canonical output. |
| 38 — World Builder and Workbench Maturity | Foundation complete | First high-value maturity slice through minimap navigation and related browser coverage. |
| 39 — Collaboration and Shared Worlds | Design complete | Authority, lease, conflict, and reproducibility design approved; current application remains single-author. |
| 40 — Designed Landmass and Water Authoring | Foundation complete | Blank-land authoring plus bounded terrain/water/elevation/resource edits. |
| 41 — Settlement Seeds and Authoring Profiles | Foundation complete | Town, village, and dispersed-homestead starting templates with explicit geography. |
| 42 — Food Security, Settlement Growth, and Migration Signals | Foundation complete | Settlement material evidence and food-reserve pressure in household relocation. |
| 43 — Hosted Single-Node Simulation Boundary | Foundation complete | One owner-controlled durable hosted run behind typed server commands. |
| 44 — Measured Ten-Thousand-Person Scale | Complete | Reproducible 10,000-detailed-person benchmark, restore digest check, and one measured live-person index optimization. |
| 45 — Fidelity Regions and Population Aggregation | Foundation complete | Explicit projection fidelity contract and exact aggregate population regions; no authoritative cohorts at that stage. |
| 46 — Long-Term World History and Change Inspection | Foundation complete | Bounded population and settlement checkpoint-change summaries. |
| 47 — Large World Coordinate and Chunk Contract | Foundation complete | Versioned billion-cell-safe coordinate and chunk addressing without sparse authoritative allocation. |
| 48 — Server-Owned World Runs | Foundation complete | Durable server-owned run catalog and authoritative command boundary. |
| 49 — Background Simulation Jobs and Checkpoints | Foundation complete | Durable background jobs and checkpoints with initial recovery semantics. |
| 50 — Hosted Authority and Background-Job Correctness | Complete | Per-run coordination, FIFO authority, quantum recovery, cancellation, validation, locking, bounded HTTP input, and failure handling. |

## Active Milestone Goal Status and Traceability

All milestones in this table are **In progress**. Each has a delivered slice,
but its current written goal still contains unresolved behavior. The goal is
the combined delivered and remaining scope described by its row.

| Milestone | Issue | Delivered PR | Delivered slice | Material remaining scope |
| --- | --- | --- | --- | --- |
| 51 — Persistence Compatibility and Deterministic Portability | Not linked historically | [#55](https://github.com/smartalex32/world-simulation-engine/pull/55) | Rolling snapshot migrations for schemas 30–32, worker request failure handling, and locale-independent hosted ordering. | Backup-before-migration, equivalent validation across all persisted records, transactional telemetry imports, and cross-runtime golden fixtures. |
| 52 — Maintainability and Performance Foundation | Not linked historically | [#56](https://github.com/smartalex32/world-simulation-engine/pull/56) | Extracted a reusable projection location index and stable ordering boundary. | Engine orchestration, application controllers, remaining projection separation/indexes, shared helpers, hosted CI typecheck, and measured 10k non-regression. |
| 53 — Designed Landmass and Regional Map Authoring | Not linked historically | [#57](https://github.com/smartalex32/world-simulation-engine/pull/57) | Authored and persisted configurable 100 m–10 km physical cell scale. | Sparse hierarchical geography, local fine-detail editing, streaming previews, coastlines/resources at regional scale, import/export, and draft undo. |
| 54 — Regional Environment, Hydrology, Climate, and Ecology | Not linked historically | [#58](https://github.com/smartalex32/world-simulation-engine/pull/58) | Stable exact-cell downhill drainage and terminal-basin evidence. | Rivers, lakes, watersheds, regional climate, biomes, renewable ecology, hazards, and behavioral/environmental effects. |
| 55 — Settlement Seeds and Starting Population Placement | Not linked historically | [#59](https://github.com/smartalex32/world-simulation-engine/pull/59) | Five deterministic settlement seed profiles with capacity, density, resource, and travel previews. | Household/trait distribution authoring and integrated 100,000+ detailed-local/cohort-distant placement. |
| 56 — Regional Population Cohorts | Not linked historically | [#60](https://github.com/smartalex32/world-simulation-engine/pull/60) | Versioned authoritative static cohort ledger with exact totals and cell allocation. | Cohort lifecycle, trait distributions, resource/economic decisions, migration, events, and active regional behavior. |
| 57 — Fidelity Materialization and Dematerialization | Not linked historically | [#61](https://github.com/smartalex32/world-simulation-engine/pull/61) | Deterministic non-mutating materialization plans and protected-person blocking. | Actual authoritative materialization, dematerialization, reconciliation, transition persistence, relationships/history preservation, and residual handling. |
| 58 — Settlement Growth, Decline, and Regional Migration | Not linked historically | [#62](https://github.com/smartalex32/world-simulation-engine/pull/62) | Retained monthly settlement scale with resource/access evidence and hysteresis. | Service-aware growth, abandonment, resettlement, cohort/detailed migration, decline, and regional movement. |
| 59 — World History at Regional Scale | [#63](https://github.com/smartalex32/world-simulation-engine/issues/63) | [#76](https://github.com/smartalex32/world-simulation-engine/pull/76) | Checkpoint comparison for detailed/cohort population, food, and settlement scale/store evidence. | Authoritative migration/environment/fidelity timelines, regional comparisons, change maps, settlement timelines, and causal drill-down. |
| 60 — Workbench UI Convergence | [#64](https://github.com/smartalex32/world-simulation-engine/issues/64) | [#77](https://github.com/smartalex32/world-simulation-engine/pull/77) | Keyboard-accessible minimap recentering with presentation-only semantics. | Modular workspace convergence, richer responsive/accessibility coverage, layers/minimap maturity, and navigation for every authoritative entity model. |
| 61 — Infrastructure, Services, and Trade Networks | [#65](https://github.com/smartalex32/world-simulation-engine/issues/65) | [#78](https://github.com/smartalex32/world-simulation-engine/pull/78) | Read-only settlement evidence for markets, schools/capacity, and roads. | Network capacity, maintenance, accessibility, disruption, ports/storage/services, trade routing, and behavioral effects. |
| 62 — Regional Economy, Labor, Wealth, and Inequality | [#66](https://github.com/smartalex32/world-simulation-engine/issues/66) | [#79](https://github.com/smartalex32/world-simulation-engine/pull/79) | Read-only household food/tool distribution, zero-food counts, Gini indicators, and occupation counts. | Production chains, goods, money/prices, ownership, labor, wealth, scarcity, trade flows, and economic feedback. |
| 63 — Groups, Associations, Institutions, and Factions | [#67](https://github.com/smartalex32/world-simulation-engine/issues/67) | [#80](https://github.com/smartalex32/world-simulation-engine/pull/80) | Read-only profiles for existing school organizations and recorded member relationships. | Authoritative general groups, formation/change, goals, owned resources, reputation, internal dynamics, guilds, religious organizations, and factions. |
| 64 — Territorial Governance and Polity Formation | [#68](https://github.com/smartalex32/world-simulation-engine/issues/68) | [#81](https://github.com/smartalex32/world-simulation-engine/pull/81) | Read-only local-governance profile tied to an observed catchment. | Explicit territory, jurisdiction, civic membership, regions/polities, and formation, merger, fragmentation, expansion, contraction, and disappearance. |
| 65 — Law, Public Finance, and State Capacity | [#69](https://github.com/smartalex32/world-simulation-engine/issues/69) | [#82](https://github.com/smartalex32/world-simulation-engine/pull/82) | Explanation of the four inputs to local food-relief legitimacy. | Laws, taxation, budgets, administration, public works, enforcement, compliance, corruption, and institutional effectiveness. |
| 66 — Culture, Religion, Language, and Collective Identity | [#70](https://github.com/smartalex32/world-simulation-engine/issues/70) | [#83](https://github.com/smartalex32/world-simulation-engine/pull/83) | Home-catchment summaries of person-owned language, beliefs, and recorded transmission. | Traditions, values, belief institutions, rituals, religions, identities, cultural boundaries, prestige, and institution-mediated transmission. |
| 67 — Diplomacy, Organized Conflict, and Warfare | [#71](https://github.com/smartalex32/world-simulation-engine/issues/71) | [#84](https://github.com/smartalex32/world-simulation-engine/pull/84) | Catchment summaries of recorded interpersonal disputes and local resolution evidence. | Polity claims, alliances, diplomacy, mobilization, military organizations, logistics, warfare, occupation, peace, displacement, trauma, and territorial change. |
| 68 — Technology, Knowledge, and Innovation Diffusion | [#72](https://github.com/smartalex32/world-simulation-engine/issues/72) | [#85](https://github.com/smartalex32/world-simulation-engine/pull/85) | Catchment summaries of person-owned knowledge, inventors, recency, and practical techniques. | Inventions, tools, education, communication, adoption, institution/resource dependencies, and inspectable diffusion. |
| 69 — Generational Society Feedback | [#73](https://github.com/smartalex32/world-simulation-engine/issues/73) | [#86](https://github.com/smartalex32/world-simulation-engine/pull/86) | Catchment summaries of retained child inheritance, experience, and development evidence. | Adult behavior changing institutions/environment/community conditions and multi-generation feedback into later childhood development. |
| 70 — Civilization-Scale Validation and Product Completion | [#74](https://github.com/smartalex32/world-simulation-engine/issues/74) | [#87](https://github.com/smartalex32/world-simulation-engine/pull/87) | Fixed-seed 30-day checkpoint plus 7-day recovery/continuation audit with structured cross-system evidence. | Completion of prerequisite milestone goals; long-running multi-scenario validation, 10k/100k+ performance budgets, recovery/migration/import/export audits, scenario comparison, analytics, and production-readiness documentation. |

# Cross-Cutting Acceptance Policy

* Complete one coherent, independently reviewable slice per PR.
* A slice PR updates its milestone's delivered boundary and traceability row.
* A PR merge does not automatically change the milestone goal status.
* Goal completion requires explicit acceptance evidence and no material
  remaining scope under that milestone.
* `pnpm typecheck`, hosted typecheck, unit tests, build, E2E tests, and GitHub
  verification pass as appropriate before merge.
* Simulation changes include fixed-seed, invariant, controlled-scenario,
  statistical, snapshot, and explanation coverage as applicable.
* Scaling changes include measured budgets at 10,000 detailed people, 100,000+
  mixed-fidelity people, and sparse large-world fixtures.
* UI changes include cross-browser, constrained-width, accessibility, and PR
  screenshot evidence.
* Persistence changes explicitly migrate or reject incompatible data.
* Supporting abstractions or read-only projections alone do not complete a
  milestone whose goal requires authoritative behavior.

# Traceability Going Forward

For new roadmap work:

1. Create and link one tracking issue from the milestone heading or ledger.
2. Record every merged delivery PR in the milestone's traceability row.
3. Update both delivered and remaining scope in the same PR.
4. Change goal status only when its definition is satisfied.
5. When a remaining item moves elsewhere, name the receiving milestone rather
   than silently deleting it.
6. When a milestone is split, keep stable milestone numbering and add a clear
   suffix or slice identifier rather than renumbering historical milestones.

Milestones 51–58 predate issue-level roadmap tracking. Their historical PRs are
recorded; tracking issues can be linked when next-step planning resumes.

# Explicit Deferrals and Non-Goals

Generative AI remains outside authoritative simulation behavior.

Genetics, clinical disease modeling, generative narrative, multiplayer
authority, real-time collaborative editing, distributed simulation authority,
and indefinite compatibility with every pre-release schema remain unplanned
unless explicitly promoted into this roadmap.

The approved collaboration authority design remains available in
[`COLLABORATION_AND_SHARED_WORLDS.md`](COLLABORATION_AND_SHARED_WORLDS.md), but
design completion is not implementation completion.

# Roadmap Maintenance

Keep current milestone truth in this file. Keep current architecture in
`README.md`, development rules in `AGENTS.md`, detailed trait/influence semantics
in `TRAIT_AND_INFLUENCE_SYSTEM.md`, and superseded roadmap wording under
`docs/archive/`.

This consolidation intentionally selects no next milestone or slice.
