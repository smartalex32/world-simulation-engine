# Post-46 Roadmap

This phase alternates designed-world authoring and single-player cloud-scale
foundations. It targets one million total people only through explicit,
inspectable mixed fidelity; it does not assume one million detailed agents.

## Milestones

47. **Large World Coordinate and Chunk Contract** — Implemented. Versioned
chunk keys, bounds, and layouts provide sparse-storage-ready addressing without
changing current dense simulation behavior.
48. **Server-Owned World Runs** — Implemented foundation. Durable owner-scoped
run catalog and service reuse around the existing authenticated command and
bounded-projection boundary; no collaboration or browser authority.
49. **Background Simulation Jobs and Checkpoints** — Implemented. The
single-owner host advances jobs in persisted deterministic quanta, exposes
progress and cancellation, persists every quantum, and reconciles interrupted
job progress from the authoritative run snapshot after restart.
50. **Designed Landmass and Regional Map Authoring** — Chunk-scoped terrain,
water, elevation, and deterministic import/export.
51. **Settlement Seeds and Starting Population Placement** — Explicit
homestead/village/town/city seeds and reproducible allocations.
52. **Regional Population Cohorts** — Authoritative, explained aggregate people
for distant regions, with exact reconciliation.
53. **Fidelity Materialization and Dematerialization** — Seeded, inspectable
transitions that preserve important people and history.
54. **Settlement Growth, Decline, and Regional Migration** — Measured growth
from geographic opportunity and demographic flows.
55. **World History at Regional Scale** — Bounded cohort, settlement, migration,
and fidelity-transition comparisons without active-run replay.

Every milestone keeps server authority, fixed-seed reproducibility, bounded
browser projections, and hooked-person detail. Collaboration, politics,
warfare, and hidden approximations remain out of scope.
