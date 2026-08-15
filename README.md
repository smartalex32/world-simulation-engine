# World Simulation Workbench

A local-first, spatial simulation workbench. Milestone 0 established the deterministic engine and workbench, Milestone 1 added seeded people and explainable stochastic behavior, Milestone 2 added consumable resources and terrain-aware spatial effects, and Milestone 3 adds deterministic co-located encounters and sparse relationships.

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
- Simulation-affecting quantities use integers or documented fixed-point units.
- Serialized collections have stable ordering; canonical objects sort their keys.
- RNG state, event sequence, schema version, and engine version are part of snapshots.
- The current engine is `0.4.0` and the current snapshot schema is `4`; schema-3 snapshots are rejected as unsupported rather than migrated.
- Any change to rules, RNG behavior, execution order, or fixed-point conversion requires an engine-version change and updated regression fixture.

Wall-clock metadata such as save timestamps is deliberately outside the simulation state and digest.

## Current boundaries

Implemented: deterministic seeded valley generation, 200 seeded people, curiosity/risk-tolerance/sociability traits, hourly hunger, move/eat/explore/rest/socialize decisions, utility explanations, consumable and regenerating food stocks, deterministic contention, multi-hour terrain travel, weighted pathfinding, spatial/resource statistics, co-location encounter pools, seeded positive/neutral/tense encounter outcomes, canonical bidirectional relationships with familiarity, interaction frequency, affection, trust, respect, and fear, daily frequency decay, encounter and relationship events, social aggregates (`social.encounters`, relationship count, network density, familiarity, and outcome counters), worker play/pause/fast-forward, population and Canvas map inspection, events, diagnostics, IndexedDB saves, and JSON import/export. Relationship state, last-encounter data, social statistics, and explanation fields are available through the engine projection and persistence paths. The hooked-person inspector shows last-encounter probability, cell, and outcome plus directional relationship values; encounter events navigate to either participant; social metrics are visible in the workbench; and the map draws the hooked person’s direct relationship ties.

Movement decisions currently target adjacent cells; the pathfinder is used for route inspection and is ready for longer-range destinations. Socialize creates an eligible encounter opportunity, and the engine resolves co-located pairs through the dedicated encounters stream.

Deferred: roads and infrastructure modifiers, long-range goals, activity-location schedules, households, development, community feedback, map editing, accounts, and server execution.
