# Application completion status

This records the work on `codex/complete-remaining-issues`, created from main
at `3b2144a`. It is a progress record, not a 1.0 completion declaration.

## Implemented on this branch

- Organization specializations and opt-in schism, merger, and dissolution,
  with bounded local evidence, stable identities, lineage, closing rosters,
  conserved accounts, and retained accepted/rejected structural traces.
- Physical service reassignment, conservative capacity partition, retirement,
  maintenance suppression, immutable estate accounts, and protection of
  identities referenced by organization history during cohort conversion.
- Full structural reconciliation in durable organization events, shared entity
  references for persistence queries and history links, and schema-49 migration
  with explicit legacy evolution opt-out semantics.
- Organization inspector sections for identity, membership, owned accounts,
  observer reputation, leadership, proposals, resolutions, and structural
  evidence. Parent/result organizations and participants link to inspection.
- Explicit faction membership context in relationship views. This creates no
  synthetic relationship edges or personal identity assignments.
- Correct categorical terrain missing-value counts and accurate labeling of
  the base-map rendering budget.

## Remaining GitHub scope

The open issues cover several complete simulation capabilities. They cannot be
considered finished merely because their inspection surfaces exist.

| Issue | Remaining completion evidence or implementation |
| --- | --- |
| [#143](https://github.com/smartalex32/world-simulation-engine/issues/143) | Structural lifecycle implementation, review fixes, and validation are on this branch; the changes are not yet committed or published. |
| [#142](https://github.com/smartalex32/world-simulation-engine/issues/142) | Capability-wide causal scenarios, multi-seed integration, hosted/standalone lifecycle persistence, and organization scale evidence. |
| [#97](https://github.com/smartalex32/world-simulation-engine/issues/97) | Organization epic acceptance and the #142 integration gate. |
| [#98](https://github.com/smartalex32/world-simulation-engine/issues/98) | Pack-defined culture, religion, language, identity, practices, and contact-based transmission across people and cohorts. |
| [#99](https://github.com/smartalex32/world-simulation-engine/issues/99) | Authoritative polities, jurisdiction, civic membership, law, administration, budgets, enforcement, and state capacity. |
| [#100](https://github.com/smartalex32/world-simulation-engine/issues/100) | Pack-defined knowledge/capability dependencies, invention, teaching, adoption, and diffusion. |
| [#101](https://github.com/smartalex32/world-simulation-engine/issues/101) | Diplomacy, military organization, logistics, strategic conflict, occupation, and peace. |
| [#102](https://github.com/smartalex32/world-simulation-engine/issues/102) | Integrated generational feedback and controlled multi-generation evidence. |
| [#103](https://github.com/smartalex32/world-simulation-engine/issues/103) | Historical branches, comparisons, geographic change, retention, and the complete export contract. |
| [#104](https://github.com/smartalex32/world-simulation-engine/issues/104) | Connect the established workbench to the remaining authoritative capabilities and finish their accessible inspection flows. |
| [#105](https://github.com/smartalex32/world-simulation-engine/issues/105) | Full 1.0 operational audit, including the specified 100k-person, 200-year benchmark and recovery exercises. |

## UI reference

The available reference is the six-workspace specification and existing
screenshots documented in `UI_DESIGN_SYSTEM.md` and
`EPIC_104_CONVERGENCE.md`. The user's original mockup images have not yet been
located. The current branch preserves that documented map-first layout, dark
palette, gold accents, shared inspection cards, and typed navigation. An exact
comparison against the original images is still outstanding.

Current browser evidence: [organization inspector](screenshots/organization-inspector.png).
This is a capture of the implemented interface, not one of the original mockups.

## Validation record

`pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` pass.
The full test command passed 383 unit, 37 hosted, 71 contract, 11 determinism,
29 persistence, 26 integration (including PostgreSQL), and 4 scale checks.
Focused regressions cover structural conservation, corruption rejection,
archive expiry, physical service retirement, and prior-version state digests.

All 42 Chromium journeys and the 10 Firefox/WebKit critical and organization
inspection journeys passed. Browser artifacts also cover narrow layouts,
keyboard navigation, reduced motion, and forced colors. The build retains its
existing warning about a main bundle larger than 500 kB. These checks establish
the tested behavior; they do not substitute for the remaining capability or
1.0 acceptance gates above.
