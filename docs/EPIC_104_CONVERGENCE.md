# Epic #104 reference-workbench convergence

This audit records the reference-GUI state delivered by issues #150–#160. It
does not claim that Capability 17 is complete: Epic #104 remains open until the
authoritative capabilities named below, especially historical analysis #103,
provide the data and commands required by its final completion gate.

## Child-issue evidence

| Issue | Delivered contract | Direct implementation and validation evidence |
| --- | --- | --- |
| #150 | Modular shell, compact information hierarchy, shared panels, and dark analytical tokens | `src/ui/layout/WorkbenchShell.tsx`, `src/ui/components/WorkbenchPrimitives.tsx`, `src/styles.css`, and the navigation/browser shell tests in `tests/e2e/workbench.suites.ts` |
| #151 | One typed owner for workspace, selection, focus, comparison, time, filters, detail, return location, URL restoration, and run reconciliation | `src/ui/controllers/useWorkbenchNavigation.ts`, `src/ui/controllers/useWorkbenchNavigation.test.ts`, and cross-workspace browser-history tests |
| #152 | Dependency-free, bounded, deterministic visualization adapters with exact units, gaps, missing states, provenance, and readable graph/chart alternatives | `src/ui/visualization`, `src/ui/visualization/visualization.test.tsx`, and `vite.config.ts` component-test coverage |
| #153 | Comprehensive person evidence workspace with condition, schedule, household, origins, traits, needs, knowledge, skills, relationships, experience, and cross-links | `src/ui/person`, `src/ui/person/personViewModel.test.tsx`, and the fixed-person inspection journeys |
| #154 | Bounded ego-network exploration with directional relationship evidence, filters, stable layout, keyboard nodes, and a table alternative | `src/ui/relationships`, `src/ui/relationships/relationshipViewModel.test.tsx`, and the person-to-network quality journey |
| #155 | Bounded world/context/entity timeline lanes, retained metric series, explicit telemetry gaps/truncation, exact payload drill-down, and deterministic chronicle | `src/ui/HistoryPanel.tsx`, `src/ui/history`, `src/history/history.ts`, timeline component tests, and persistence/history browser journeys |
| #156 | Registry-driven primary/context/future map layers, explicit units/source/cadence/availability, visible-area evidence, opacity, and projection-owned LOD/fidelity | `src/ui/map`, `src/ui/map/layerRegistry.test.ts`, `src/ui/HexMap.tsx`, and map LOD/navigation browser tests |
| #157 | Correlated worker commands, duplicate suppression, run controls, effective immutable configuration, phase/RNG diagnostics, and honest persistence health | `src/ui/simulation`, `src/ui/controllers/useSimulationSession.ts`, `src/projection`, command/controller tests, and simulation quality journeys |
| #158 | Registry-backed metric cards, retained trends, separate detailed/cohort composition, geographic scope comparison, provenance, and unavailable future metrics | `src/ui/analytics`, analytics component/view-model tests, and analytics navigation/budget browser tests |
| #159 | Keyboard and landmark audits, 320-pixel reflow, forced-colors/reduced-motion behavior, non-color states, deterministic render budgets, and Chromium/Firefox/WebKit visual artifacts | `docs/WORKBENCH_ACCESSIBILITY.md`, `tests/e2e/quality.spec.ts`, `tests/e2e/visualBaselines.ts`, and the quality capability suite |
| #160 | Cross-surface convergence, legacy-journey reconciliation, capability ownership audit, version review, and fixed-seed persistence-to-causal-evidence journey | This document, README/roadmap updates, and the `follows persisted causal evidence from controls through history, geography, and analytics` browser test |

## Integrated journeys

The fixed-seed browser gates exercise the reference surfaces as one product:

- person → bounded relationship network → selected-person evidence timeline →
  focused map;
- worker-owned one-day step → named atomic snapshot → retained community event
  → exact causal payload → geographic catchment → scoped analytics;
- map and minimap navigation → presentation-only selection without a canonical
  tick or hash change;
- analytics metric/scope filters → serialized URL state → browser back/forward;
- invalid, missing, empty, partial, stale, truncated, history-gap, and unavailable
  states with named accessible output.

Desktop and constrained-width screenshots are captured as test artifacts from
the fixed-seed convergence journey. Review-only images are not committed.

## Authority and capability matrix

| Workbench module | Data/command authority | Bounded browser contract | Explicit future dependency |
| --- | --- | --- | --- |
| Person workspace | Worker-built person projection and structured inspector evidence | Current projected person plus bounded relationships, family, knowledge, experience, and selected traces | Full culture/identity #98 and generational feedback #102 |
| Relationship explorer | Authoritative relationship, parent-child, organization-membership, and geographic-context projections | One capped ego network with missing-endpoint/truncation evidence; no inferred clusters | Organizations/factions #97; collective identity #98; polity/diplomacy overlays #99/#101 |
| Evidence timeline | IndexedDB event/statistic/checkpoint queries committed from worker snapshots | Indexed range, newest-event cap, sampled metrics, explicit retention and telemetry gaps | Immutable branches, replay, time-lapse, comparison, and expanded exports #103 |
| Spatial analysis | Worker viewport projection over authoritative geography and current domain projections | LOD cells/regions, capped render primitives/markers, one primary layer and bounded context stack | Authoritative settlement dynamics #93, infrastructure #95, economy #96, groups #97, culture #98, polities #99, warfare #101 |
| Simulation and systems | Typed worker/session commands; persistence controller and database own saves/import/export | Correlated acknowledgement, duplicate suppression, read-only effective configuration and phase manifest | Hosted collaboration/admin #90; content-pack maturity #89; durable runtime completion #88; advanced historical exports/cancellation #103 |
| World analytics | Worker projection plus retained statistic/event queries | Registry-defined cards, capped composition/events, retained samples only, compatible geographic comparisons | Settlement #93, infrastructure #95, economy #96, groups #97, culture #98, governance #99, technology #100, warfare #101, generations #102, historical comparison #103 |
| Tools and settings | Worker-owned draft controller, content-pack registry, and presentation diagnostics | Draft commands and read-only diagnostics; no direct simulation mutation | Sparse authoring #91, pack platform #89, shared-world administration #90 |

Unsupported controls are disabled or absent and state their dependency. The UI
does not synthesize authoritative entities, trends, memberships, metrics, or
successful health states when their owner has not supplied them.

## Transport, version, and reproducibility review

- The workbench projection protocol moves from version 18 to 19 because the
  effective run configuration and phase manifest are new projected fields.
  Client and worker use the same typed protocol and reject mismatched versions.
- `ENGINE_VERSION`, `SNAPSHOT_SCHEMA_VERSION`, world-generator versions, and
  model/registry versions do not change. No authoritative state or persisted
  snapshot meaning changed.
- No simulation rule, RNG stream, draw count, draw order, fixed-point rule,
  canonical digest input, or tie-breaker changed.
- Visualization sampling, graph layout, range filtering, map opacity, browser
  timing, viewport size, accessibility preferences, and screenshot capture are
  nonauthoritative and consume no simulation RNG.
- Viewport, person, relationship, timeline, analytics, and render transfers are
  capped. Aggregate counts remain explicit, and truncation never masquerades as
  complete detail.

## Completion status

The six reference analytical workspaces converge on the same navigation,
selection, time, formatting, color, availability, keyboard, and responsive
contracts. No known critical GUI blocker remains after the full lint, unit,
build, and cross-browser gates pass.

Epic #104 must remain open. Its GUI foundation is delivered, while final
backend-connected authoring, collaboration, domain analytics, branching,
comparison, export, and administration remain owned by the linked capability
epics. Those are product dependencies, not decorative placeholders in React.
