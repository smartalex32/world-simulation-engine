# World Simulation Engine — Agent Guide

## Mission

Build the application incrementally into an explainable, reproducible, spatial, stochastic agent-based world simulator. The core product hypothesis is:

```text
geography and environment
  -> individual exposure and experience
  -> probabilistic behavior and development
  -> social interaction
  -> emergent community conditions
  -> new exposure for current and future people
```

The application must eventually support very large worlds and long time spans, but each change should validate one small part of this loop before adding more scope.

## Canonical Documents

- `README.md` describes the current implemented architecture and boundaries.
- `docs/TRAIT_AND_INFLUENCE_SYSTEM.md` defines the target person-variable layers, trait registry, sparse influence graph, exposure, behavior, development, and community feedback model.
- Tests and serialized fixtures define the current reproducibility contract.

When code and a design document differ, do not silently choose one. Preserve current behavior, identify the mismatch, and update the relevant document as part of an intentional migration.

## Current Repository

- React 19 + TypeScript + Vite frontend.
- DOM-free simulation code in `src/simulation/`.
- Typed Web Worker boundary in `src/worker/`.
- IndexedDB persistence in `src/persistence/`.
- Canvas map and workbench UI in `src/ui/` and `src/App.tsx`.
- Vitest unit/regression tests and Playwright Chromium/Firefox/WebKit end-to-end tests.
- One-hour base ticks, PCG32 random streams, snapshot schemas, registry versions, engine versions, and canonical state digests.
- Engine `0.8.0`, snapshot schema `8`, variable-registry version `1`, influence-registry version `1`, household-model version `1`, activity-registry version `1`, development-registry version `1`, and community-registry version `1`; schema-7 snapshots are rejected rather than migrated.

Milestones 0–6 are implemented. In addition to the deterministic engine, spatial behavior, relationships, variable/influence registries, households, activities, exposure, experiences, and development, the repository now provides deterministic geographic catchments, bounded daily community evidence, five emergent measures, structural food security, contributor traces, scoped telemetry, and opportunity-gated community feedback.

## Non-Negotiable Contracts

1. **No generative AI in simulation behavior.** Do not add LLM calls, generated decisions, or external AI-service dependencies.
2. **Reproducibility.** Identical initial state, configuration, engine version, world version, and seed must produce identical canonical output.
3. **Centralized randomness.** Simulation randomness comes only from named, snapshot-restorable RNG streams. Never use `Math.random()` or wall-clock time for simulation outcomes.
4. **Explainability.** Important decisions and developmental changes must expose their contributing factors, final score, probability, and chosen outcome.
5. **Semantic separation.** Keep dispositions, values, attitudes, beliefs, short-term states, needs, relationships, experiences, community properties, and environment distinct.
6. **Exposure over membership.** A person is influenced by where they spend time and whom they encounter—not by receiving every property of a named community automatically.
7. **Sparse influences.** Use explicit, typed influence edges. Never build a complete pairwise variable matrix.
8. **Simulation/UI separation.** Presentation code renders projections and sends commands; it does not mutate authoritative simulation state.
9. **Stable serialization.** Preserve deterministic ordering, explicit units, schema versions, engine versions, and migration/validation boundaries.
10. **Incremental scope.** Do not implement distant systems merely because the architecture may eventually support them.

## Architectural Boundaries

Keep these responsibilities separable:

- `simulation/domain`: serializable authoritative state and typed identifiers.
- `simulation/rng`: seeded streams and deterministic random selection.
- `simulation/spatial`: coordinates, neighborhood queries, effective distance, paths, and spatial partitioning.
- `simulation/agents`: opportunities, decision evaluation, action selection, and action execution.
- `simulation/variables`: namespaced variable definitions, registry ordering, and bounded integer permille person values.
- `simulation/influences`: sparse typed edge definitions, target indexes, and exact linear modifier evaluation.
- `simulation/exposure`: exact parent-curiosity co-presence exposure, bounded windows, source-hour accumulation, and structured experiences.
- `simulation/relationships`: co-location encounter resolution, multi-dimensional relationship state, and scheduled frequency decay.
- `simulation/development`: age-dependent plasticity and deterministic, explainable curiosity changes from structured experiences.
- `simulation/community`: geographic catchments, daily evidence, emergent measures, structural conditions, aggregation traces, and sparse community feedback.
- `worker`: engine ownership and typed command/projection transport.
- `persistence`: snapshots, meaningful events, sampled statistics, imports, exports, and migrations.
- `ui`: visualization, controls, inspectors, overlays, and diagnostics.

Do not let arbitrary modules directly mutate traits or learned variables. Changes must pass through the owning system and produce inspectable reasons.

## Implementation Roadmap

Work in independently reviewable vertical slices. The next unfinished slice takes precedence over later ideas unless the user explicitly changes priority.

### Milestone 3 — Social Encounters and Relationships (Implemented)

Implemented in engine `0.4.0` and retained in `0.5.0`:

- Build encounter pools from shared cells or activity locations; avoid global O(N²) comparisons.
- Add familiarity, interaction frequency, affection, trust, respect, and fear as independent relationship dimensions where needed.
- Resolve simple encounter outcomes using sociability, context, familiarity, and seeded probability.
- Add encounter/relationship events, daily aggregates, person inspection, and network inspection.
- Validate that dense and dispersed settlements create different encounter and network patterns.

### Milestone 4 — Variable, Trait, and Influence Registries (Implemented)

Implemented in engine `0.5.0` and snapshot schema `5`:

- Replace hardcoded trait access with typed registry IDs and bounded variable storage.
- Start only with curiosity, risk tolerance, sociability, trust, conformity, and persistence.
- Add hunger, fatigue, and social need as state/need variables—not traits.
- Implement a sparse influence registry with linear, immediate edges first.
- Centralize coefficients and units; retain per-action modifier traces.
- Add fixed-seed, edge-level, statistical tendency, invariant, and snapshot compatibility tests.

The implemented registry contains six traits (`curiosity`, `riskTolerance`, `sociability`, `trustPropensity`, `conformity`, and `persistence`), two states (`hunger` and `fatigue`), and one need (`socialConnection`), all stored as namespaced integer permille values. Eleven enabled linear immediate edges currently affect action utility. Trust propensity, conformity, and persistence are stored, initialized, serialized, validated, and displayed but have no behavior utility edges yet.

New-variable initialization uses named streams for `population.variable.person.trait.trustPropensity`, `population.variable.person.trait.conformity`, `population.variable.person.trait.persistence`, `population.variable.person.state.fatigue`, and `population.variable.person.need.socialConnection`. Hourly cadence adds 12 hunger, 10 fatigue, and 8 social need; rest removes up to 180 fatigue and encounters remove up to 140 social need from both participants. Action inspection preserves structured base/context/interaction/influence contributions with source and edge metadata.

Schema-5 snapshots are explicitly rejected rather than migrated. Person-array order remains part of authoritative state and RNG assignment; order-independent person processing is deferred and must be treated as a deliberate engine migration if introduced.

### Milestone 5A — Activities and Household Topology (Implemented)

- Add simple home/activity-location schedules without building a full occupation economy.
- Add the fixed first topology: 50 two-parent/one-child households, 50 single-adult households, and 200 people total; child ages are 6–17.
- Keep household membership and explicit parent-child links separate from social relationships.
- Add versioned child/adult schedules, physical home/commons activity locations, travel exclusion from activity pools, aging, activity events, and home/commons/travel person-hour statistics.
- Introduce the configurable fictional curiosity starting-predisposition model using parental mean, population baseline, and seeded random variation. This is not a biological claim.
- Expose current activity, household members, parent-child roles, activity-location and household overlays, and the inheritance trace in the inspector.

### Milestone 5B — Exposure, Experiences, and Development (Implemented in engine 0.7.0)

- Exposure uses `exposure.parent.curiosity-modeling` and is accumulated only from linked parent/child co-presence in the same household home cell and canonical home activity location. Membership, same-cell presence, commons activity, and travelers do not count.
- Each window spans exactly 720 ticks: 1–720, 721–1440, and so on. Recipient hours, source hours, weighted source curiosity hours, and source IDs are bounded and serialized.
- Completed windows emit `experience.parent.curiosity-modeling` with exposure strength `min(1000, floor(sourceHours * 1000 / 720))` and symmetric integer source-mean rounding.
- `development.parent-curiosity-to-curiosity` applies deterministic curiosity development using `(sourceMean - current) * exposureStrength * plasticity / 1,000,000`, symmetric rounding, and clamping. Plasticity is 30/15/3/1 permille per month for childhood/adolescence/adult/late-life age bands.
- Development uses no random stream. Each person retains only the latest structured experience and latest non-zero `DevelopmentChangeTrace`; events are `PERSON_EXPERIENCED_PARENT_MODELING` and `PERSON_VARIABLE_DEVELOPED`; metrics are `household.parentChildCoExposureSourceHours`, `development.experiences`, `development.curiosityChanges`, and `development.absoluteCuriosityChange`.
- Schema 6 is rejected rather than migrated. Broader household conditions, birth/death, occupations, institutions, community feedback, other developmental variables, and biological interpretation remain explicit non-goals for this slice.

### Milestone 6 — Emergent Community Feedback (Implemented in engine 0.8.0)

- The initial valley has two deterministic, complete, non-overlapping geographic catchments. People have no community-membership field; evidence and feedback use actual current cells.
- Daily bounded evidence derives social trust, cohesion, cooperation, conflict, and innovation climate. Structural food security remains semantically separate.
- Each measure retains its latest exact fixed-point contributor trace. Community events and statistics are scoped by catchment so equal metric/tick values cannot overwrite each other.
- Social trust, cohesion, cooperation, and conflict feed only available socialize opportunities; innovation climate feeds only available exploration opportunities. Effects are centered at neutral 500 permille and begin after the daily update.
- Community processing adds no RNG stream. Schema 7 is rejected rather than migrated.
- Conflict is a tense-encounter/fear/food-insecurity proxy, not violence. Cooperation is a successful-social-interaction/trust/socialize-uptake proxy, not resource transfer. Institutions, prestige weighting, overlapping communities, and community-to-child development remain deferred.

### Milestone 7 — Large-World Rendering and Simulation Scale

- Add level-of-detail rendering: local hexes, regional aggregation, then continuous world-scale geography without visible hexes.
- Keep agent markers bounded in screen space; aggregate or hide them at distant zoom levels.
- Preserve a hooked person’s highlight and live inspector data without forcing camera follow.
- Add viewport culling, chunked spatial data, cached aggregate overlays, and worker projection budgets as demonstrated needs arise.
- Separate visualization cadence from simulation cadence and support fast-forward without rendering every tick.

### Milestone 8 — World Creation Tools

- Introduce a small editable/test-world workflow before a full map editor.
- Add terrain, elevation, water, resources, roads, settlements, import/export, and seeded generation incrementally.
- Defer detailed hydrology, climate, ecosystems, political borders, and collaborative editing until the simulation core proves their need.

Politics, warfare, religion, language, detailed economics, technology trees, narrative generation, multiplayer, and massive cohort simulation remain later product areas. Create abstractions for them only when a current slice requires a boundary.

## Working Method

Before changing code:

1. Read `README.md`, this file, the relevant design document, nearby implementation, and tests.
2. Inspect `git status`; preserve user changes and unrelated work.
3. State the smallest testable behavior the change will add.
4. Identify whether the change affects engine output, RNG draws, tick order, snapshots, or fixed-point conversions.

During implementation:

1. Implement one behavior through the full path: domain/configuration → engine → worker/persistence if needed → UI inspection → tests.
2. Prefer pure functions and explicit inputs in `src/simulation/`.
3. Use stable collection ordering and deterministic tie-breaking.
4. Put coefficients in registries or named configuration, with documented units and normalization.
5. Record meaningful events; sample statistics; keep detailed debug traces selective.
6. Add observability in the app, not only console/server logs.
7. Avoid broad refactors unless the vertical slice cannot be expressed safely without one.

After implementation:

1. Run the smallest relevant tests while iterating.
2. Run the full required validation before handoff.
3. Update engine and snapshot versions when the reproducibility or persistence contract changes.
4. Update documentation when implemented boundaries, formulas, or milestone status change.
5. Report what changed, what remains deferred, validation results, and any migration impact.

## Required Validation

Run from the repository root:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Add tests proportional to the change:

- Unit tests for formulas, curves, availability, execution, and boundaries.
- Fixed-seed regression tests for reproducibility.
- Controlled scenarios that isolate one causal difference.
- Statistical multi-seed tests for probabilistic tendencies.
- Invariant tests for legal bounds, valid probabilities, location uniqueness, resource conservation, and impossible actions.
- Snapshot round-trip/migration tests for persisted state changes.
- UI/API and cross-browser end-to-end tests for important workbench flows.

Do not make probabilistic tendency claims from a single seed. Use deterministic fixtures for exact-output tests and repeated seeds for distributional tests.

## Simulation Change Checklist

Treat a change as simulation-affecting if it alters rules, ordering, opportunity generation, random draws, coefficients, units, or state. For such changes:

- Decide whether `ENGINE_VERSION` must change.
- Decide whether `SNAPSHOT_SCHEMA_VERSION` must change.
- Update canonical digest fixtures deliberately.
- Verify named RNG stream ownership and snapshot restoration.
- Ensure debug/explanation data describes the new calculation.
- Confirm old snapshots are rejected or migrated explicitly rather than misread.

## UI and Map Expectations

- The map must be capable of representing extremely large worlds.
- Hex outlines are a local-detail representation; fade or remove them as the user zooms out.
- Use level-appropriate aggregation for people, resources, events, statistics, and boundaries.
- Person icons must not scale up to cover the world. Clamp their screen-space size and cluster/hide them when appropriate.
- Hooking a person keeps that person highlighted and their inspector live as they move; it does not force the camera to follow them.
- Simulation fidelity and rendering fidelity are independent.
- Preserve seed, tick/date, speed, events, metrics, cell inspection, person history, and action explanations as first-class diagnostics.

## Definition of Done

A slice is complete when:

- The behavior is user-visible or inspectable end to end.
- Simulation ownership remains outside the UI.
- Seeded runs remain reproducible in supported browsers.
- Relevant unit, scenario, statistical, invariant, persistence, and UI tests pass.
- Performance remains reasonable for the current 200–500-agent validation world.
- No opaque or scattered coefficients/randomness were introduced.
- Documentation reflects the actual implementation and names explicit non-goals.

If a proposed change is much larger than these criteria can verify independently, split it before implementation.
