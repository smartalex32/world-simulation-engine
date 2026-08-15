# World Simulation Workbench

A local-first, spatial simulation workbench. Milestone 0 established the deterministic engine, Web Worker runtime, axial-hex world, local persistence, inspection tools, and cross-browser regression suite. Milestone 1 adds seeded people and explainable stochastic behavior.

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
- `src/worker/` owns the live engine and exposes a typed command/response protocol. The UI only receives projections.
- `src/persistence/` stores autosaves, named snapshots, meaningful events, and statistics in IndexedDB. JSON bundles provide import/export.
- `src/ui/` and `src/App.tsx` contain presentation and workbench interaction code. They do not mutate authoritative engine state.

## Reproducibility contract

The same initial state or validated snapshot, simulation configuration, engine version, and seed must produce the same canonical state digest in supported Chromium, Firefox, and WebKit versions.

Rules that preserve this contract:

- Simulation code must not call `Math.random()` or use wall-clock time to determine outcomes.
- Random draws come from named, snapshot-restorable PCG32 streams.
- Simulation-affecting quantities use integers or documented fixed-point units.
- Serialized collections have stable ordering; canonical objects sort their keys.
- RNG state, event sequence, schema version, and engine version are part of snapshots.
- Any change to rules, RNG behavior, execution order, or fixed-point conversion requires an engine-version change and updated regression fixture.

Wall-clock metadata such as save timestamps is deliberately outside the simulation state and digest.

## Current boundaries

Implemented: deterministic seeded valley generation, 200 seeded people, curiosity/risk-tolerance/sociability traits, hourly hunger, move/eat/explore/rest/socialize decisions, utility explanations, daily aggregate samples, worker play/pause/fast-forward, population and Canvas map inspection, viewport-culling and borderless regional map levels, events, diagnostics, IndexedDB saves, and JSON import/export.

Food is currently a non-depleting local opportunity value. Movement is limited to adjacent passable cells, and socialize records a choice without changing relationships.

Deferred: consumable resource stocks, terrain/path travel cost resolution, encounter outcomes, familiarity, relationships, households, development, map editing, accounts, and server execution.
