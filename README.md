# World Simulation Workbench

A local-first, spatial simulation workbench. Milestones 0–2 established the deterministic spatial engine, explainable stochastic behavior, consumable resources, and terrain-aware travel. Milestone 3 added co-located encounters and sparse relationships. Milestone 4 added namespaced person variables, a sparse influence registry, bounded state updates, and structured action explanations. Milestone 5 added household activity, exposure, structured experiences, age-dependent curiosity development, and explainable developmental traces. Milestone 6 adds geographically derived community measures and opportunity-gated feedback into agent decisions.

## Run locally

```powershell
pnpm install
pnpm dev
```

Production and verification commands:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

## Architecture

- `src/simulation/` is DOM-free TypeScript. It owns serializable state, PCG32 randomness, the simulation clock, spatial functions, statistics, and snapshots.
- `src/simulation/agents/` owns population initialization, local opportunity discovery, utility contributions, weighted action selection, and action resolution.
- `src/simulation/relationships/` owns co-location encounter pools, seeded encounter outcomes, canonical relationship dimensions, and interaction-frequency decay.
- `src/simulation/variables/` owns the nine namespaced person-variable definitions and bounded permille storage.
- `src/simulation/influences/` owns the eleven sparse, linear, immediate decision-influence edges and exact integer evaluation.
- `src/simulation/households/` owns the fixed initial household topology, explicit parent-child links, the fictional curiosity starting-predisposition model, and household-generation streams.
- `src/simulation/activities/` owns versioned child/adult schedules, physical home/commons activity resolution, and activity-location identity.
- `src/simulation/exposure/` owns the exact parent-curiosity exposure channel, bounded 720-hour windows, source-hour accumulation, and structured experience creation.
- `src/simulation/development/` owns age-band plasticity and deterministic, explainable curiosity development from structured experiences.
- `src/simulation/community/` owns deterministic geographic catchments, bounded daily evidence, emergent and structural community measures, aggregation traces, and sparse community-to-decision feedback.
- `src/simulation/engine/` coordinates action selection, encounter resolution, relationship updates, daily social aggregates, invariant checks, and projections.
- `src/simulation/spatial/` owns axial geometry, deterministic world generation, viewport-independent map logic, and weighted A* pathfinding.
- `src/worker/` owns the live engine and exposes a typed command/response protocol. The UI only receives projections.
- `src/persistence/` stores autosaves, named snapshots, meaningful events, and statistics in IndexedDB. JSON bundles provide import/export.
- `src/ui/` and `src/App.tsx` contain presentation and workbench interaction code. They do not mutate authoritative engine state.

## Reproducibility contract

The same initial state or validated snapshot, simulation configuration, engine version, and seed must produce the same canonical state digest in supported Chromium, Firefox, and WebKit versions.

Rules that preserve this contract:

- Simulation code must not call `Math.random()` or use wall-clock time to determine outcomes.
- Random draws come from named, snapshot-restorable PCG32 streams.
- Encounter resolution uses its own named `encounters` stream so social draws remain isolated from world generation, population initialization, and action selection.
- Trust propensity, conformity, persistence, fatigue, and social-need initialization use dedicated `population.variable.<variable-id>` streams. The original `population` stream retains home, age, curiosity, risk-tolerance, sociability, and hunger draw order.
- Simulation-affecting quantities use integers or documented fixed-point units.
- Serialized collections have stable ordering; canonical objects sort their keys.
- RNG state, event sequence, schema version, and engine version are part of snapshots.
- The current engine is `0.8.0`, snapshot schema is `8`, variable-registry version is `1`, influence-registry version is `1`, household-model version is `1`, activity-registry version is `1`, development-registry version is `1`, and community-registry version is `1`. Schema-7 snapshots are rejected as unsupported; no migration is provided.
- Any change to rules, RNG behavior, execution order, or fixed-point conversion requires an engine-version change and updated regression fixture.
- Person-array order currently remains part of authoritative state and RNG assignment. Making equivalent states insensitive to person-array reordering is deferred.

Wall-clock metadata such as save timestamps is deliberately outside the simulation state and digest.

## Current boundaries

Milestones 3–6 are implemented. The engine provides co-location encounter pools; seeded positive, neutral, and tense outcomes; canonical bidirectional relationships with familiarity, interaction frequency, affection, trust, respect, and fear; daily frequency decay; encounter/relationship events; social aggregates; household activity; exposure; structured experiences; deterministic developmental traces; and geographic community feedback. The workbench exposes hooked-person movement and relationships without camera following, household/activity/development inspection, decision explanations, community evidence, scoped statistics, and community map diagnostics.

Person state now uses nine integer `0..1000` permille variables: `person.trait.curiosity`, `person.trait.riskTolerance`, `person.trait.sociability`, `person.trait.trustPropensity`, `person.trait.conformity`, `person.trait.persistence`, `person.state.hunger`, `person.state.fatigue`, and `person.need.socialConnection`. Eleven sparse influence edges contribute to eat, move, explore, rest, and socialize utility. Inspector traces distinguish base, contextual, interaction, and registry-backed influence contributions and retain edge ID, source ID/value, weight, effect, alternatives, and selection probability.

Each hour adds 12 hunger, 10 fatigue, and 8 social need, with bounded storage. Rest removes up to 180 fatigue, encounters remove up to 140 social need from both participants, and food removes two hunger units per food unit. Trust propensity, conformity, and persistence are initialized, serialized, displayed, and validated but deliberately have no behavior utility edges yet.

Movement decisions currently target adjacent cells; the pathfinder is used for route inspection and is ready for longer-range destinations. Socialize creates an eligible encounter opportunity, and the engine resolves co-located pairs through the dedicated encounters stream.

The first 5A validation population is exactly 200 people: 50 two-parent/one-child households and 50 single-adult households. Children start between ages 6 and 17; family parents are assigned at least 18 years older. Household membership and parent-child links are separate authoritative graphs from social relationships. Each household has a physical home activity location, and each passable cell has a commons activity location. Children use `activity.schedule.child.v1` (home 00:00–08:00 and 16:00–24:00, commons 08:00–16:00); adults use `activity.schedule.adult.v1` (home 00:00–06:00 and 18:00–24:00, commons 06:00–18:00). A person remains physically in their cell while the schedule resolves their activity location; a person on a journey has no activity-location encounter pool. Encounters are built from shared activity locations, not merely from physical cell membership.

5A advances age in hours, updates the age-derived child/adult schedule, emits activity changes and aging events, and samples home, commons, and travel person-hours. It adds named streams `population.households.childAge`, `population.ageRemainderHours`, and `population.inheritance.person.trait.curiosity`; existing population and variable streams retain their contracts. Child curiosity uses `inheritance.parental-baseline-variation.v1`: a configurable fictional starting predisposition from parental mean, a population baseline of 500, and seeded random variation, with weights 500/300/200 respectively. This is a starting tendency, not a fixed outcome and not a biological claim. The UI exposes household members, parent-child roles, current activity, activity locations, and the inheritance trace; map overlays can show households and activity locations.

Deferred beyond the current implementation: behavioral effects for trust propensity/conformity/persistence, household conditions, broader inheritance, person-array order normalization, roads and infrastructure modifiers, long-range goals, overlapping or institutional communities, map editing, accounts, server execution, and any biological interpretation of the fictional inheritance model.

Milestone 5B uses the exact IDs `exposure.parent.curiosity-modeling`, `experience.parent.curiosity-modeling`, and `development.parent-curiosity-to-curiosity`. Exposure is granted only when a child and linked parent(s) are physically co-present in the same household home cell and canonical home activity location; household membership, same-cell presence, commons co-location, and travel alone do not grant exposure. Each exposed child hour increments recipient hours and each co-present linked parent increments source hours and weighted source curiosity hours. Windows run from ticks 1–720, 721–1440, and so on. At each boundary, source mean is symmetric integer-rounded weighted source value divided by source hours, exposure strength is `min(1000, floor(sourceHours * 1000 / 720))`, and curiosity changes by symmetric rounding of `(sourceMean - current) * exposureStrength * plasticity / 1,000,000`, clamped to `0..1000`. Plasticity is 30 permille/month for childhood, 15 for adolescence, 3 for adults, and 1 for late life. Development is deterministic and consumes no RNG stream.

Only the latest bounded structured experience and latest non-zero development trace are retained per person. Meaningful events are `PERSON_EXPERIENCED_PARENT_MODELING` and `PERSON_VARIABLE_DEVELOPED`; sampled metrics are `household.parentChildCoExposureSourceHours`, `development.experiences`, `development.curiosityChanges`, and `development.absoluteCuriosityChange`. Broader household conditions, birth/death, occupation, institutions, other developmental variables, and biological interpretation remain out of scope.

Milestone 6 divides the initial valley into two deterministic, complete, non-overlapping geographic catchments. This is an exposure boundary, not person membership: hourly evidence is attributed to the catchment containing the person, action, arrival, encounter, or resource at that time. Each 24-hour window records bounded person-hours, commons exposure, action selections, exploration arrivals, meal outcomes, encounter outcomes, post-encounter relationship dimensions, and pre-regeneration food supply.

Five emergent measures—social trust, cohesion, cooperation, conflict, and innovation climate—are updated from that observed evidence with named fixed-point formulas and 750/250 prior/observation smoothing. Food security is deliberately separate as a structural measure with 500/500 smoothing. Every update retains its latest exact contributor trace. “Conflict” currently means a tense-encounter/fear/food-insecurity proxy, not violence; “cooperation” means a successful social-interaction/trust/socialize-uptake proxy, not material helping.

Community feedback is sparse and opportunity-gated. Social trust, cohesion, cooperation, and conflict modify socialize utility only when a co-located social opportunity exists; innovation climate modifies explore utility only when an unknown passable neighbor exists. The effect is centered on neutral 500 permille, uses the person’s actual current-cell catchment, begins on the tick after daily aggregation, and is retained in the action explanation. Community aggregation and feedback use no additional random stream. Institutions, inequality, crime, violence, resource transfers, prestige weighting, overlapping communities, and community-driven childhood development remain deferred. Milestone 7 is next: chunked projections and large-world level-of-detail rendering.
