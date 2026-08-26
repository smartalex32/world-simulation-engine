# World Simulation Engine — 1.0 Roadmap

## Authority, goal, and delivery rules

This is the authoritative 1.0 ledger. Historical work remains recorded in
[POST_23_ROADMAP.md](POST_23_ROADMAP.md) and Git history; it is not evidence
that the complete capabilities below exist. 1.0 delivers world building through
the UI, packs, import/export, REST, SDK, and CLI; reproducible observation and
branching rather than character control; PostgreSQL-backed single-node shared
hosting; a customizable preindustrial setting; 10,000 detailed and 100,000
mixed-fidelity people; and evidence-linked historical, geographic, social,
political, economic, cultural, and causal analysis.

Each linked capability has one branch and one PR to `main`. Its PR remains draft
until all authoritative behavior, persistence, public interfaces, UI, default
pack definitions, documentation, and tests are complete. Main must not receive
another “foundation complete” substitute. Later domain work extends both the
generic pack schema and the default preindustrial pack.

## 1. Deterministic runtime and durable persistence ([#88](https://github.com/smartalex32/world-simulation-engine/issues/88))

Replace hosted JSON persistence with transactional PostgreSQL: relational
metadata plus compressed/checksummed canonical snapshots and event batches.
Keep standalone IndexedDB with atomic validation-and-commit imports. Separate
orchestration/controllers/projections/persistence/engine execution with one
authoritative executor per run. Deliver backup-before-migration, verified
restore, crash recovery, transactional telemetry import, job/run reconciliation,
current-plus-prior-two schema migrations, and browser-worker/server golden
fixtures.

## 2. Declarative content-pack platform ([#89](https://github.com/smartalex32/world-simulation-engine/issues/89))

Deliver versioned manifests, dependencies, stable IDs, validation, migrations,
deterministic interchange, and a safe deterministic DSL for formulas,
conditions, probabilities, and effects. It cannot access time, I/O, arbitrary
code, or untracked randomness; probabilistic rules declare engine-owned named
RNG streams. Migrate setting data to a preindustrial pack and deliver editors,
JSON, REST, SDK types, diagnostics, and pack-difference inspection.

## 3. Shared worlds and public integration platform ([#90](https://github.com/smartalex32/world-simulation-engine/issues/90))

Deliver local accounts; owner/editor/viewer roles; immutable draft revisions;
renewable editor leases; stale-revision rejection; shared projections;
authorized controls; noncanonical audit records; Argon2id, HTTP-only same-site
sessions, hashed scoped opaque tokens, bounded inputs, and reverse-proxy TLS
guidance. Publish `/api/v1` REST for accounts, packs, worlds, drafts/revisions/
leases, runs/branches/commands/jobs/checkpoints/projections/histories/exports;
ordered resumable SSE; OpenAPI; SDK; CLI; Docker Compose; migrations; health;
backup/restore; and operator docs.

## 4. Sparse world authoring and living environment ([#91](https://github.com/smartalex32/world-simulation-engine/issues/91))

Use hierarchical sparse chunks and billion-cell-safe coordinates. Complete
terrain/coast/elevation/water/resource/biome/settlement/route/placement editing
with undo/redo, streamed previews, validation, and versioned interchange. Add
deterministic rivers, lakes, watersheds, seasons, climate, biomes, abstract
flora/fauna stocks, agriculture, renewable resources, succession, hazards, and
human-environment feedback. Exclude global fluids, individual animals, and
terraforming.

## 5. Population authoring, cohorts, and fidelity transitions ([#92](https://github.com/smartalex32/world-simulation-engine/issues/92))

Allow household, age, trait, occupation, culture, language, wealth, and
settlement distributions. Cohorts carry demographics, traits, resources,
production, consumption, migration, development, culture, and events.
Materialization/dematerialization is deterministic, conserves state, protects
stable identities, retains history, records reconciliation, and owns named RNG.
Support 10,000 detailed / 100,000 total people independent of viewport/timing.

## 6. Authoritative settlements and regional dynamics ([#93](https://github.com/smartalex32/world-simulation-engine/issues/93))

Make settlements authoritative with membership, extent, households, services,
institutions, markets, accessibility, capacity, and materials. Model formation,
growth, contraction, abandonment, resettlement, urban/rural transition, and
detailed/cohort migration from employment, food, housing, safety, ties,
infrastructure, services, geography, and shocks with causal traces.

## 7. Health, disease, and demographic stress ([#94](https://github.com/smartalex32/world-simulation-engine/issues/94))

Add configurable fictional pathogens: exposure transmission, incubation,
infectiousness, recovery, immunity, recurrence, care capacity, mortality, and
equivalent detailed/cohort semantics with outbreak/intervention/displacement/
demographic evidence. No clinical realism claim or genetics.

## 8. Infrastructure, transport, and public services ([#95](https://github.com/smartalex32/world-simulation-engine/issues/95))

Model roads, waterways, ports, storage, facilities, capacity, costs,
construction, ownership, maintenance, degradation, disruption, repair, and
accessibility. Affect migration, markets, governance, health, logistics, and
viability through explicit shared interfaces.

## 9. Preindustrial stock-flow economy ([#96](https://github.com/smartalex32/world-simulation-engine/issues/96))

Deliver pack-defined goods/recipes/tools/inventories/decay, production,
consumption, ownership, labor, wages, markets, fixed-point prices, currency,
transport, trade, taxation inputs, wealth, inequality, conservation, and
explanation traces. Exclude banking, credit, interest, securities, and
industrial finance.

## 10. Organizations, social groups, and factions ([#97](https://github.com/smartalex32/world-simulation-engine/issues/97))

Generalize pack-defined organizations: purpose, roles, membership, assets,
leadership, decisions, reputation, succession, schism, merger, dissolution. Add
informal groups/factions from relationships, identity, interests, proximity, and
exposure, keeping all entity boundaries semantically distinct.

## 11. Culture, religion, language, and identity ([#98](https://github.com/smartalex32/world-simulation-engine/issues/98))

Add pack-defined traditions, values, beliefs, rituals, religions, identities,
practices, languages/dialects/fluency/boundaries. Acquisition, retention,
conversion, syncretism, change, inheritance, and diffusion come from contact,
institutions, households, and setting media—not membership alone.

## 12. Polities, governance, law, and state capacity ([#99](https://github.com/smartalex32/world-simulation-engine/issues/99))

Add jurisdiction, civic membership, polity formation/annexation/secession/
merger/collapse, leadership, representation, legitimacy, succession, and
pack-defined laws, taxes, budgets, administration, works, enforcement,
compliance, corruption, and services with decision explanations.

## 13. Technology, knowledge, and innovation ([#100](https://github.com/smartalex32/world-simulation-engine/issues/100))

Deliver a pack-defined dependency graph for knowledge, skills, tools,
techniques, inventions, prerequisites, materials, projects, teaching,
preservation, adoption costs, compatibility, and diffusion. Adoption requires
people, materials, incentives, institutions, communication, and exposure—not a
global era ladder.

## 14. Diplomacy and strategic warfare ([#101](https://github.com/smartalex32/world-simulation-engine/issues/101))

After prerequisite systems, add claims, treaties, alliances, diplomacy,
mobilization, military organizations, strategic movement/logistics/campaigns,
aggregate battles, casualties, occupation, resistance, peace, displacement, and
trauma. Only materialized/protected people have individual outcomes; no tactical
control or real-time units.

## 15. Generational feedback ([#102](https://github.com/smartalex32/world-simulation-engine/issues/102))

Complete detailed/cohort multi-generation feedback: adult health/resources/
relationships/culture/institutions/conflict/education/environment affect
fertility, parenting, childhood exposure, opportunity, development, and future
adults. Preserve represented parentage/identity; no genetic simulator. Validate
controlled multi-generation and multi-seed causal tendencies.

## 16. Historical analysis, branching, and exports ([#103](https://github.com/smartalex32/world-simulation-engine/issues/103))

Provide timelines for every entity/domain, immutable branches, checkpoint/branch
comparison, geographic change maps, time-lapse, causal drill-down, and
evidence-linked chronicles. Retain annual checkpoints, monthly metrics,
permanent meaningful events/traces, and one simulated year of fine telemetry
before deterministic compaction. Export bundles, JSON, NDJSON, CSV, GeoJSON,
and Parquet.

## 17. Complete world-builder and analysis workbench ([#104](https://github.com/smartalex32/world-simulation-engine/issues/104))

Converge authoring, packs, collaboration, controls, navigation, history,
comparison, analytics, exports, and administration into a map-first app after
authoritative entities exist. Add inspectors, cross-links, loading/error/
recovery states, responsive keyboard operation, WCAG 2.2 AA, and cross-browser
visual baselines. UI controls only call real worker/server capabilities.

## 18. Stable 1.0 completion audit ([#105](https://github.com/smartalex32/world-simulation-engine/issues/105))

Start only after 1–17 are Complete. Validate installation, two-generation
PostgreSQL migration with mandatory backup/restore, interrupted jobs, corrupt
input, account/lease recovery, import/export, branches, and reproducibility. On
documented 8-core/32-GB/local-SSD hardware: 100,000 mixed-fidelity people for
200 years under 24 hours, p95 bounded reads under two seconds, cancellation
authoritative under five seconds. Investigate full preindustrial scenarios and
publish architecture/deployment/security/recovery/API/SDK/CLI/pack/model/
performance/operator documentation before tagging 1.0.

## Contracts, merge gates, and boundaries

Increment engine, snapshot, generator, and registry/model versions only when
their respective contracts change. Every authoritative change records RNG
ownership/draw order, units, stable ordering, digest impact, and migration or
rejection. Releases support current plus prior two schemas, verify backup before
migration, and explicitly reject unsupported formats. PostgreSQL is hosted
authority; browser persistence is standalone/cache only. Wall-clock/users/
leases/audits stay outside canonical state. Commands use REST; SSE is ordered,
resumable, bounded, and reconstructible.

Every capability passes typecheck, unit/build/full browser E2E, fixed-seed and
restore contracts, causal/multi-seed/invariant/explanation validation, and final
docs/packs/versions/fixture review. Hosted work adds PostgreSQL concurrency,
crash, migration, backup/recovery, and browser/server-golden tests. APIs add
OpenAPI/SDK/CLI tests. UI adds accessibility/browser coverage and PR screenshots
when upload access is available.

1.0 excludes CRDT coediting, multi-node hosting, managed cloud tenancy,
external identity, arbitrary trusted code plugins, generative-AI behavior,
direct/god-game control, tactical combat, clinical medicine, genetics,
individual animals, global fluids, banking, credit, and securities.
