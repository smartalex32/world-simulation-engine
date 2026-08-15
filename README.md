# World Simulation Workbench

A local-first, spatial simulation workbench. Milestones 0–2 established the deterministic spatial engine, explainable stochastic behavior, consumable resources, and terrain-aware travel. Milestone 3 added co-located encounters and sparse relationships. Milestone 4 added namespaced person variables, a sparse influence registry, bounded state updates, and structured action explanations.

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
- The current engine is `0.5.0`, snapshot schema is `5`, variable-registry version is `1`, and influence-registry version is `1`. Schema-4 snapshots are rejected as unsupported; no migration is provided.
- Any change to rules, RNG behavior, execution order, or fixed-point conversion requires an engine-version change and updated regression fixture.
- Person-array order currently remains part of authoritative state and RNG assignment. Making equivalent states insensitive to person-array reordering is deferred.

Wall-clock metadata such as save timestamps is deliberately outside the simulation state and digest.

## Current boundaries

Milestones 3 and 4 are implemented. The engine provides co-location encounter pools; seeded positive, neutral, and tense outcomes; canonical bidirectional relationships with familiarity, interaction frequency, affection, trust, respect, and fear; daily frequency decay; encounter/relationship events; and social aggregates. The hooked-person inspector shows last-encounter probability, cell, and outcome plus directional relationship values; encounter events navigate to either participant; social metrics are visible; and the map draws the hooked person’s direct ties.

Person state now uses nine integer `0..1000` permille variables: `person.trait.curiosity`, `person.trait.riskTolerance`, `person.trait.sociability`, `person.trait.trustPropensity`, `person.trait.conformity`, `person.trait.persistence`, `person.state.hunger`, `person.state.fatigue`, and `person.need.socialConnection`. Eleven sparse influence edges contribute to eat, move, explore, rest, and socialize utility. Inspector traces distinguish base, contextual, interaction, and registry-backed influence contributions and retain edge ID, source ID/value, weight, effect, alternatives, and selection probability.

Each hour adds 12 hunger, 10 fatigue, and 8 social need, with bounded storage. Rest removes up to 180 fatigue, encounters remove up to 140 social need from both participants, and food removes two hunger units per food unit. Trust propensity, conformity, and persistence are initialized, serialized, displayed, and validated but deliberately have no behavior utility edges yet.

Movement decisions currently target adjacent cells; the pathfinder is used for route inspection and is ready for longer-range destinations. Socialize creates an eligible encounter opportunity, and the engine resolves co-located pairs through the dedicated encounters stream.

Milestone 5—activity schedules, households, structured experiences, exposure accumulation, and development—is next. Deferred beyond the current implementation: behavioral effects for trust propensity/conformity/persistence, person-array order normalization, roads and infrastructure modifiers, long-range goals, community feedback, map editing, accounts, and server execution.
