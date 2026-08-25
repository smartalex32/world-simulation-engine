# Post-23 Product Roadmap

## Purpose

This document preserves the detailed plans and implementation record for
Milestones 24–46. Active sequencing after Milestone 49 is maintained in
`docs/ROADMAP.md`.

The intended product loop remains:

```text
physical environment
  -> exposure, opportunity, and experience
  -> individual decisions and development
  -> relationships, households, and organizations
  -> settlement and regional conditions
  -> changed future exposure
```

Every milestone must remain a small, independently testable vertical slice. A
later milestone may be split or postponed when its required evidence does not
yet exist. No milestone may use generative AI or an LLM for authoritative
simulation behavior.

## Sequencing Principles

1. A map label must not become an implicit person membership field.
2. Geographic effects must be measured through homes, travel, activity,
   encounters, infrastructure, and time spent—not settlement names alone.
3. Add one new causal loop at a time, with an explanation trace and a controlled
   scenario that can demonstrate it.
4. Expand data retention only when an inspection feature needs authoritative
   evidence; do not persist every internal calculation or hourly state.
5. Defer mass-scale and collaborative features until measured workloads and
   product use make their contracts concrete.

## Phase A — Places, Movement, and Local Opportunity

### Milestone 24 — Settlement Catchments and Inspection

**Status:** Implemented (authored catchment and inspection foundation)

**Objective:** Turn settlement markers into inspectable geographic places while
preserving the distinction between a place, a community, and person membership.

**Smallest vertical slice:** An author defines a bounded catchment polygon or
cell set around a settlement. The engine exposes read-only, spatially measured
home, visitor, resource-access, and travel statistics for that catchment.

**Acceptance evidence:** Two otherwise equal settlements with different spatial
catchments show different measured access and encounter profiles. Inspectors
show the source cells and metrics for every displayed value.

**Explicit non-goals:** Municipal government, taxes, citizenship, culture
assignment, city growth, and borders.

**Implemented boundary:** Authors may draw a bounded, disjoint, passable cell
set containing each settlement anchor. The worker validates it through the
versioned world-creation path. The workbench reports actual nearby homes,
visitors, resource capacity, and whether the profile uses the authored area or
fallback anchor radius. It remains inspection-only and does not affect behavior.

### Milestone 25 — Water, Routes, and Geographic Accessibility

**Status:** Implemented (road-cost and water-access foundation)

**Objective:** Add the first practical environmental features that make place
choice and regional movement meaningfully different.

**Smallest vertical slice:** Seeded water sources and a simple river/ford
representation alter travel feasibility, resource access, and settlement
attraction. Roads retain their existing travel-cost role and may cross water
only through explicit crossings.

**Acceptance evidence:** Fixed-seed scenarios demonstrate that water and route
placement change travel cost, food access, and destination choice without
changing results merely because a person has a settlement label.

**Explicit non-goals:** Full hydrology, precipitation simulation, oceans,
shipping, climate, and erosion.

**Implemented boundary:** Authored road cells now reduce real effective movement
cost by a centralized 650-permille multiplier. Settlement inspection derives
water-access cell counts from catchment cells adjacent to existing water terrain.
There is no thirst, water inventory, river generation, ford, or shipping model
in this slice.

### Milestone 26 — Household Relocation and Settlement Change

**Status:** Implemented (bounded monthly relocation foundation)

**Objective:** Let people and households change where they live through
available housing/place opportunities rather than scripted population totals.

**Smallest vertical slice:** A household can evaluate a small set of reachable
home destinations using food access, travel burden, household ties, risk, and
current crowding. A successful relocation creates an explainable event and
changes later real geographic exposure.

**Acceptance evidence:** Across many seeds, scarcity or difficult access makes
the affected catchment lose more households than a matched favorable catchment.

**Explicit non-goals:** International migration, refugees, land markets,
property law, or automatic city growth.

**Implemented boundary:** Every 720 hours, each household evaluates at most 24
reachable homes within eight hexes. Local food access, road-adjusted path cost,
nearby relationship familiarity, home-cell crowding, household hunger, and risk
tolerance yield an integer utility and a named-stream probability. A successful
move updates the shared home activity and each member's future geographic
exposure; its full contributing trace is retained on the household and emitted
as a `HOUSEHOLD_RELOCATED` event. This is not a settlement-membership change,
housing market, or migration system.

## Phase B — Material Life and Settlements

### Milestone 27 — Local Goods and Exchange Places

**Status:** Implemented (bounded co-present tool exchange foundation)

**Objective:** Extend the existing food-production foundation into a small,
spatial local-exchange loop.

**Smallest vertical slice:** Add one durable non-food good and one bounded
market/activity location. Households make explicit offers/requests when they
are co-present or connected by a reachable route; exchanges record price-free
quantities, counterparties, and reasons.

**Acceptance evidence:** A central accessible exchange place produces more
completed exchanges than an equally resourced dispersed scenario. Resource
conservation and deterministic exchange ordering are tested.

**Explicit non-goals:** Currency, banking, firms, dynamic price discovery,
taxes, corporations, or a global economy.

**Implemented boundary:** One market is attached to a real passable commons
cell. Household-owned durable tools have deterministic initial scarcity and
surplus; co-present households exchange at most one tool per market interval in
stable order. Every transfer preserves tool totals and records counterparties.

### Milestone 28 — Settlement Services and Institutions

**Status:** Implemented (bounded school-service access foundation)

**Objective:** Connect existing schools, households, and organizations to
places through actual attendance and service access.

**Smallest vertical slice:** A school or commons is placed at an activity
location and exposes a bounded service opportunity. Distance, route access,
schedule, household capacity, and individual traits determine attendance.

**Acceptance evidence:** Nearby/connected children receive more measurable
learning exposure than geographically isolated otherwise matched children;
inspectors show attendance and missed-opportunity causes.

**Explicit non-goals:** Universal public services, budgets, administrative
hierarchies, religion, or government ownership of every institution.

**Implemented boundary:** Settlement-anchored schools provide a fixed-capacity,
daily eight-hour service window to explicitly enrolled learners. Each learner
receives one stable-order draw from the dedicated attendance stream; available
access is evaluated from a real path's road-adjusted travel cost, an available
adult household member, curiosity, and persistence. Attending children occupy
the school commons for the service window and accumulate inspectable learning
hours; missed opportunities retain a no-route, household-capacity, distance,
capacity, or declined trace. This is neither school ownership of a settlement
nor a general education, budget, or institutional hierarchy model.

### Milestone 29 — Regional Routes and Inter-Settlement Networks

**Status:** Implemented (bounded route-accessibility projection foundation)

**Objective:** Make roads, movement, exchange, and institutions visible as a
regional network rather than disconnected local features.

**Smallest vertical slice:** Derive deterministic settlement-to-settlement
accessibility links from actual routes, travel cost, and recorded visits or
exchange. Present a bounded regional network overlay and sampled metrics.

**Acceptance evidence:** Adding a route reduces effective distance and raises
cross-settlement visits/exchange in multi-seed comparisons.

**Explicit non-goals:** Nations, trade treaties, currency areas, or automatic
political territory.

## Phase C — Regional Society

### Milestone 30 — Spatial Cultural and Language Diffusion

**Status:** Implemented (co-attendance exposure and bounded regional observation foundation)

**Objective:** Extend the current culture and language foundations through
actual interaction, travel, schools, households, and institutions.

**Smallest vertical slice:** Record source-specific cultural/language exposure
from encounters and attendance, then apply the existing bounded development
model on its scheduled cadence. Add regional diversity and convergence metrics.

**Acceptance evidence:** Connected settlements converge faster than isolated
matched settlements, while no person acquires a culture merely from a named
settlement assignment.

**Explicit non-goals:** Detailed constructed languages, religion, propaganda,
or nation-level identity.

**Implemented boundary:** Culture and language continue to transfer only through
real resolved encounters. School attendees share a real activity location during
their service window, so normal encounter transmission supplies an actual
co-attendance exposure path without a settlement assignment. The workbench now
derives bounded per-settlement observations of residents' language fluency and
cultural beliefs; these are read-only measurements, not influences.

### Milestone 31 — Territorial Governance and Civic Legitimacy

**Status:** Implemented (local food-relief legitimacy foundation)

**Objective:** Extend the local-governance foundation only after services,
movement, and regional relationships produce inspectable civic evidence.

**Smallest vertical slice:** A governance unit administers an explicitly
authored or derived geographic service area. It offers one visible public good
and applies one transparent collective contribution rule. Legitimacy changes
through observed service access, fairness, and interactions—not settlement
membership.

**Acceptance evidence:** Matched service-area scenarios produce explainable
differences in legitimacy and cooperation, with no effect on people outside
actual exposure/access paths.

**Explicit non-goals:** Kingdoms, nation states, elections beyond the existing
local foundation, comprehensive law, taxation systems, or political parties.

### Milestone 32 — Collective Conflict and Resolution

**Status:** Implemented (bounded community-contention foundation)

**Objective:** Build from interpersonal disputes toward bounded collective
conflict only where a real shared context exists.

**Smallest vertical slice:** Aggregate compatible unresolved disputes around a
specific resource, route, institution, or service area into a temporary local
contention event. Resolution options use mediation, withdrawal, or a bounded
non-lethal confrontation model with structured causes and outcomes.

**Acceptance evidence:** Resource scarcity increases contention frequency over
many seeds; stronger mediation access reduces escalation in matched scenarios.

**Explicit non-goals:** Armies, conquest, tactical combat, warfare, diplomacy,
or a global conflict simulator.

## Phase D — Living Environment and Knowledge

### Milestone 33 — Seasonal Climate, Agriculture, and Ecology

**Status:** Implemented — static terrain/elevation-derived climate zones now
apply deterministic seasonal water, regeneration, and plain-cell agricultural
productivity modifiers. Recovery and agricultural production are separately
sampled. Weather, biomes, and ecology remain deliberately deferred.

**Objective:** Replace the current simple seasonal resource pattern with the
first explicit environmental feedback loop.

**Smallest vertical slice:** A limited climate-zone/season model changes water,
food regeneration, and one agricultural activity. Resource use and recovery
are separately tracked and explained.

**Acceptance evidence:** Repeated runs show plausible seasonal production and
household-security differences without violating resource bounds or requiring
full planetary climate.

**Explicit non-goals:** Global circulation, detailed ecosystems, animal
simulation, weather visuals, or terraforming.

### Milestone 34 — Health, Disease, and Demographic Stress

**Status:** Implemented — a fictional, daily health-stress model records
actual crowding, co-presence, water access, and hunger. Its trace is available
in the person inspector and its bounded risk contribution is explicit in
annual mortality events. Pathogens and medical simulation remain deferred.

**Objective:** Add a cautious, small health system only after environmental,
household, and movement evidence supports it.

**Smallest vertical slice:** A fictional, configurable health-stress condition
uses exposure opportunities such as crowding, water access, and co-presence;
it changes temporary state and mortality risk with inspectable causal traces.

**Acceptance evidence:** Dense/water-poor controlled scenarios yield higher
stress incidence across many seeds while preserving fixed-seed reproducibility.

**Explicit non-goals:** Medical realism claims, pathogens, genetics, clinical
treatment simulation, or pandemic-scale modeling.

### Milestone 35 — Skills, Experimentation, and Practical Innovation

**Status:** Implemented — a bounded, seeded foraging experiment requires
knowledge, a household tool, and productive work. A successful local technique
retains provenance and affects only the inventor's harvesting output.

**Objective:** Extend the knowledge foundation into small useful innovations
without imposing a global technology tree.

**Smallest vertical slice:** A person with relevant knowledge, time,
materials, and opportunity may run a bounded experiment. Successful results
create a local technique with provenance, adoption conditions, and a measurable
effect on one activity.

**Acceptance evidence:** Knowledge plus material access makes experimentation
more likely across multi-seed scenarios; a technique changes only activities
that actually use it.

**Explicit non-goals:** Technology eras, arbitrary research trees, industrial
economies, or instant global diffusion.

## Phase E — History, Scale, and Product Workflow

### Milestone 36 — Historical Snapshots and Causal Replay

**Objective:** Make long-term changes inspectable with retained authoritative
evidence rather than reconstructed UI guesses.

**Smallest vertical slice:** Store bounded, versioned checkpoint snapshots at a
user-configured cadence. Allow read-only comparison of two checkpoints and a
map/time series of retained metrics; never replay by mutating the active run.

**Acceptance evidence:** A user can explain a person, catchment, or settlement
change using source events, samples, and explicit before/after snapshots.

**Explicit non-goals:** Unlimited hourly history, branching timelines, or
generative narrative.

### Milestone 37 — Scalable Authoritative Simulation

**Status:** Implemented — the first measured allocation reduction caches the
immutable authored-road index at engine construction rather than rebuilding it
on every tick. A larger-world fixed-seed regression guards canonical output.

**Objective:** Address measured simulation bottlenecks while preserving the
individual-inspection and reproducibility contracts.

**Entry gate:** A benchmark suite identifies a specific authoritative bottleneck
at a documented world/population/tick target.

**Smallest vertical slice:** Implement one measured optimization—such as
chunked cell storage, indexed encounter pools, dirty aggregation, or bounded
population paging—and add digest/restore benchmarks and tests.

**Acceptance evidence:** The benchmark improves by a stated amount with
identical canonical output for supported detailed-agent runs.

**Explicit non-goals:** Premature cohort simulation, opaque fidelity changes,
unbounded parallelism, or sacrificing hooked-person inspection.

### Milestone 38 — World Builder and Workbench Maturity

**Status:** Implemented — the workbench now provides an interactive minimap
showing settlement anchors and the current viewport, so users can navigate a
large authored world without changing authoritative simulation state.

**Objective:** Make the existing real features discoverable and efficient for
world creation, observation, and debugging.

**Smallest vertical slice:** Add one high-value authoring/inspection workflow
at a time: minimap, visual baseline coverage, settlement inspector, catchment
editor, or improved empty/error states. Every control must map to existing
authoritative capability or clearly be marked unavailable.

**Acceptance evidence:** Browser and visual tests cover the workflow at desktop
and constrained widths; map LOD and render/simulation separation remain intact.

**Explicit non-goals:** Decorative dashboards, fake kingdom/group controls, or
moving engine logic into React.

### Milestone 39 — Collaboration and Shared Worlds

**Status:** Design complete; implementation deliberately deferred until the
hosted-server foundation is selected. The authority, revision, lease, conflict,
and reproducibility contract is recorded in
[`COLLABORATION_AND_SHARED_WORLDS.md`](./COLLABORATION_AND_SHARED_WORLDS.md).

**Objective:** Consider multi-user world authoring only after draft semantics,
authorship, persistence, and conflict handling are deliberately designed.

**Entry gate:** A written concurrency and authority model specifies ownership,
merge behavior, permissions, durable storage, and reproducibility boundaries.

**Explicit non-goals:** Opportunistic real-time collaboration, multiplayer
simulation, or shared mutable drafts without a conflict model.

## Phase F — Designed Worlds and Hosted Simulation

### Milestone 40 — Designed Landmass and Water Authoring

**Status:** Implemented — authors can choose a deterministic blank-land canvas
before draft creation, then use the existing worker-owned terrain editor to
paint bounded water, land, elevation, and resource edits. The baseline and
edits are retained through preview, persistence, commit, and fixed-seed
creation.

**Objective:** Let an author intentionally compose a world’s land/water shape
and usable scale before placing settlements and people.

**Smallest vertical slice:** Add an explicit draft creation mode for a blank
water or blank land canvas, then let the existing worker-owned terrain editor
author bounded land/water regions with a clear passability and placement
preview. World dimensions and hex scale remain explicit inputs, not rendering
choices.

**Acceptance evidence:** A fixed seed plus the same ordered draft commands
produces the same committed landmask and population-placement validation. A
user can identify land, water, passable area, and unavailable placement area
without inspecting raw draft JSON.

**Explicit non-goals:** Hydrology, rivers, erosion, climate simulation,
procedural continents, a full sculpting tool, or changing live worlds.

### Milestone 41 — Settlement Seeds and Authoring Profiles

**Status: Implemented (2026-08-24).**

**Objective:** Let authors choose where people begin and select a bounded
starting settlement shape without fabricating later society-level properties.

**Smallest vertical slice:** Provide town, village, and dispersed-homestead
placement templates that produce explicit zones, homes, and initial resource
access through the existing draft and world-creation boundary.

**Explicit non-goals:** Kingdoms, cultures, classes, professions, or automatic
community membership.

### Milestone 42 — Food Security, Settlement Growth, and Migration Signals

**Status:** Implemented (household food-reserve migration pressure and settlement material evidence)

**Objective:** Make population growth, decline, and relocation visibly respond
to actual food access, household conditions, and reachable places.

**Smallest vertical slice:** Expose the existing material and relocation
evidence in settlement inspection, then add one controlled food-security
pressure that feeds a bounded household migration decision.

**Explicit non-goals:** Detailed markets, prices, national economics, or
scripted city growth totals.

**Implemented boundary:** Settlement projections now expose household count,
current household food stores, and retained successful relocation arrivals for
their geographic catchments. Household relocation retains its named RNG stream
and now adds a bounded, continuous food-reserve shortfall pressure to existing
hunger-based destination evaluation. The trace records that pressure; no
settlement membership, scripted growth, market prices, or population-total rule
has been added.

### Milestone 43 — Hosted Single-Node Simulation Boundary

**Status:** Implemented (single owner, durable file snapshots, typed HTTP command boundary)

**Objective:** Run a world on a server while keeping the browser a client of
authoritative commands and bounded projections.

**Entry gate:** Milestone 39’s authority model and a chosen durable hosted
persistence implementation.

**Smallest vertical slice:** Host one owner-controlled run with durable
snapshots and the existing worker protocol behind typed server commands.

**Explicit non-goals:** Multi-node scheduling, collaboration editing, browser
authority, or changed simulation behavior.

**Implemented boundary:** A Node-hosted service now opens one configured run,
serializes owner-authorized typed run commands, persists complete versioned
snapshots through atomic file replacement, restores the same canonical run on
restart, and serves bounded projections. It reuses the worker command/response
protocol shapes while leaving the simulation engine and browser authority model
unchanged. Continuous server play scheduling, external identity, collaboration,
and multi-node ownership remain deferred.

### Milestone 44 — Measured Ten-Thousand-Person Scale

**Status:** Implemented (detailed-agent benchmark and per-hour live-person index)

**Objective:** Support the first useful hosted world scale with measured,
reproducible performance rather than speculative billion-cell claims.

**Smallest vertical slice:** Establish a 10,000-person benchmark and optimize
one measured bottleneck while preserving digest, restore, and inspection
contracts.

**Explicit non-goals:** Hundred-thousand-person guarantees, cohorts, or
unbounded in-browser state transfer.

**Implemented boundary:** The engine now accepts up to 10,000 initial people
while the interactive builder remains capped at 500. `pnpm benchmark:scale`
builds a deterministic 128 × 128, 10,000-person world; advances it one hour;
and verifies snapshot/restore digest equality. The engine reuses a live-person
index for each hour instead of repeatedly filtering the full population across
hourly systems. The benchmark reports index builds and local timing, which are
non-authoritative diagnostics. On the reference development machine this slice
measured roughly 5.9 seconds creation, 0.58 seconds for one hour, and 1.8
seconds snapshotting. Hosts can select `HOSTED_WORLD_POPULATION` through the
same validated creation boundary. Cohorts, 100k targets, and full browser-state
transport remain explicitly deferred.

### Milestone 45 — Fidelity Regions and Population Aggregation

**Objective:** Establish explicit, inspectable fidelity boundaries for distant
populations only after detailed-agent scale has been measured.

**Smallest vertical slice:** Introduce one reversible, versioned aggregate
region representation with a documented handoff to detailed simulation.

**Explicit non-goals:** Invisible approximation, arbitrary offscreen behavior,
or replacing hooked people with aggregate statistics.

**Implemented boundary:** The versioned worker projection now labels every map
as either detailed population cells or exact aggregate population regions. Each
aggregate region exposes aligned bounds and a reconciled population count; the
projection declares that its authoritative model remains detailed agents and
that `zoom-or-focus` is the reversible path back to local detail. Hooked people
remain independently projected and prioritized in inspector transport. This
does not yet introduce cohorts, change simulation fidelity, or approximate an
off-screen person's behavior.

### Milestone 46 — Long-Term World History and Change Inspection

**Objective:** Let authors inspect why a world grew, contracted, relocated, or
diverged over long simulated spans.

**Smallest vertical slice:** Add bounded settlement and population change
timelines derived from retained authoritative checkpoints, events, and samples.

**Explicit non-goals:** Invented narratives, unlimited raw history, or replay
that mutates the active run.

**Implemented boundary:** Local history loading derives a compact summary from
the existing bounded weekly authoritative checkpoints. It displays chronological
living-population checkpoints and each settlement's geographically measured
home-catchment resident/household delta between first and latest retained
checkpoints. The UI receives no full checkpoint state, does not replay, and
does not fill unretained intervals with inferred values.

## Current Sequence

See `docs/ROADMAP.md` for the current priority and all work after Milestone 49.
This historical file should change only when correcting the record for
Milestones 24–46.
