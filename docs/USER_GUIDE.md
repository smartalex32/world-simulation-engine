# World Simulation Workbench User Guide

This guide explains how to create, run, inspect, save, and analyze a world in
the browser workbench. The workbench is an evidence-oriented interface over a
deterministic simulation: it displays worker-owned state and sends explicit
commands, but it does not silently change canonical simulation data.

## Start the workbench

From the repository root:

```powershell
pnpm install
pnpm dev
```

Open the local address printed by Vite. On first load, wait for the status pill
in the upper-right corner to change from `starting` to `paused`.

The header is available in every workspace:

- The mode navigation opens **World**, **Simulation**, **Analytics**,
  **Entities**, **History**, **Tools**, or **Settings**.
- The run facts show the active seed, simulated date and hour, engine version,
  and saved-state hash.
- The status pill reports whether the worker is starting, paused, playing, or
  in an error state.
- The control strip provides **Create world**, one-hour stepping, play/pause,
  batch size, snapshot naming and saving, import, and export.

On a wide screen, each mode uses a control panel, a primary workspace, and an
inspector. On a narrow screen, these regions stack vertically without changing
their meaning.

![World workspace with layer controls, a hex map, and the selected-cell inspector](screenshots/user-guide/world-workspace.png)

*The World workspace at the start of a deterministic run.*

## Create or edit a world

1. Select **Create world** in the control strip. This opens a detached draft;
   the running world is unchanged until you commit it.
2. Set the world name, seed, dimensions, hex radius, terrain baseline, and
   population.
3. Configure placement zones. Their allocations must add up to the requested
   population before the draft can be committed.
4. Use the authoring tools to draw zone cells, paint terrain, elevation, and
   resources, and place settlements, activity locations, catchments, or roads
   where those tools are available.
5. Review the generated preview. **Commit & create world** remains disabled
   while the preview is stale or the draft is invalid.
6. Select **Commit & create world** to validate the draft and replace the
   active run.

Useful draft controls:

- **Undo** and **Redo** move through accepted draft revisions.
- **Reset draft** restores the draft baseline.
- **Discard draft** closes the editor without changing the active run.
- **Export draft** saves authoring data as JSON; **Import draft** restores a
  compatible JSON draft.
- Preview map requests are asynchronous. Wait for the busy state to clear
  before committing or continuing a paint gesture.

Creating a separate run from the **Simulation** workspace follows the same
validated draft flow. It does not reseed an active run in place.

## Run the simulation

Use **Step +1h** in the global control strip for a single hour. For the complete
run controls, open **Simulation**.

![Simulation workspace with run controls, phase diagnostics, effective configuration, and persistence health](screenshots/user-guide/simulation-workspace.png)

*Simulation controls and the read-only configuration used by the active run.*

The Simulation workspace provides:

- **Play** and **Pause** for continuous advancement.
- **Step 1 hour** and **Step 1 day** for bounded advancement while paused.
- **Batch size** options from one hour through 30 days. Batch size controls how
  much work is requested at a time; rendering remains decoupled from simulation
  advancement.
- **Save snapshot**, **Load snapshot**, **Export run**, and **Reset current
  run**.
- A confirmed **Create new run with seed** flow that opens a new detached world
  draft.

Command buttons report pending, successful, or failed acknowledgement. Wait for
the worker acknowledgement before assuming a command has taken effect.

The phase table reports the registered simulation pipeline and recent timing.
The effective configuration is read-only evidence for the active run, including
its seed, engine and schema versions, content-pack reference, world scale, and
model versions. A feature labeled **Unavailable** is not inferred or simulated
by the interface.

## Explore the map

Open **World** to inspect spatial state.

1. Choose one primary layer, such as terrain, elevation, habitability,
   movement cost, food and resources, population, or community conditions.
2. Enable compatible context overlays, such as people, households, activity
   locations, settlements, catchments, or roads.
3. Adjust opacity to compare the primary layer with its context.
4. Select a hex to open its exact cell and regional evidence in the inspector.

Map controls:

- Drag to pan, use the arrow keys or `W`, `A`, `S`, and `D`, or select the
  minimap to recenter.
- Use the mouse wheel or `+` and `-` to zoom.
- Press `F` to fit the world to the viewport.
- Select a rendered person or use **Entities** to continue into person-level
  evidence.

The legend states the selected layer's unit, domain, palette, source, and update
cadence. Bounded or truncated projections are labeled explicitly; an empty
overlay is not automatically proof that no matching entity exists elsewhere in
the world.

## Inspect people and other entities

Open **Entities**, then select a person from the available entity evidence. You
can also reach a person from a map marker, relationship node, event payload, or
another inspector link.

![Person workspace with schedule, traits, needs, activity, geographic exposure, and health evidence](screenshots/user-guide/person-workspace.png)

*A person workspace combines current state with the recorded traces that
explain it.*

The person workspace includes:

- life status, age, household, location, and current activity;
- the current and upcoming daily schedule;
- baseline variables, dispositions, current condition, needs, and environmental
  or opportunity variables;
- recent influence, exposure, development, decision, movement, and health
  evidence when retained by the projection.

Use **Show on map**, **Relationship network**, or **Recorded history** to keep
the same person selected while changing workspaces. Browser back and forward
also restore typed workspace, entity, map, layer, and time-range navigation
state.

## Explore relationships

From a person workspace, select **Relationship network**. The explorer shows a
bounded ego network around the selected person.

![Relationship explorer with network controls and exact-evidence inspector](screenshots/user-guide/relationship-explorer.png)

*An empty network is an explicit evidence state, not a generated social graph.*

- Select a node to focus that person.
- Select an edge to inspect directional affection, trust, respect, fear, and
  last-interaction evidence. Opposing directions are shown separately and are
  not averaged.
- Use the available filters to narrow relationship, family, organization, or
  community context.
- Use keyboard navigation and zoom/fit controls to move through the bounded
  graph.
- Use the details table when exact values are more important than spatial graph
  placement.

If the active projection contains no qualifying edges, the explorer preserves
the selected person and explains that no retained relationship evidence is
available.

## Review recorded history

Open **History** to inspect persisted events, sampled statistics, and
checkpoints. Select **Refresh history** after advancing or loading a run when
you need the newest committed evidence.

1. Choose a day, week, or month range, or enter exact start and end ticks.
2. Use **Earlier** and **Later** to pan the window.
3. Select an event marker or lane entry to inspect its exact type, tick,
   sequence, subject references, and payload.
4. Follow entity links in the event inspector to open the corresponding person,
   map cell, region, household, organization, or other supported entity.
5. Select **Chronicle view** for deterministic, fixed-template summaries of
   significant retained events. Chronicle text is derived from evidence; it is
   not generated narrative.

History is a bounded persisted view. Gap, partial, truncated, and stale statuses
are meaningful diagnostics. Save a snapshot or checkpoint when you need a
durable evidence boundary for later review.

## Analyze the world

Open **Analytics** after advancing the run to compare recorded conditions across
time and scope.

![Populated analytics workspace with scope controls, trend evidence, map context, and community inspector](screenshots/epic-104/convergence-analytics-desktop.png)

*Analytics after 24 simulated hours, with a selected community scope.*

1. Select a metric category and fidelity.
2. Set the time range.
3. Choose the primary scope and, when useful, a comparison scope.
4. Review summary cards, trend evidence, spatial context, and the scope
   inspector together.

Every metric should be read with its displayed unit, source, cadence, and
caveats. Comparison cards report recorded values; they do not turn a partial
projection into a world aggregate. Selecting a region, community, map cell, or
person in Analytics can hand that scope to the corresponding detailed
workspace.

![Analytics workspace stacked for a narrow viewport](screenshots/epic-104/convergence-analytics-constrained.png)

*The same evidence hierarchy remains available in the constrained layout.*

## Save, load, import, and export

- Enter a snapshot name in the control strip and select **Save**, or select
  **Save snapshot** in Simulation. A success message confirms the persisted
  checkpoint.
- Select **Load snapshot** or **Import** and choose a compatible exported run.
- Select **Export** or **Export run** to download the active snapshot together
  with its retained evidence as an NDJSON bundle.
- **Reset current run** restores the current run through the worker and clears
  navigation selections that would point at obsolete state.

Local saves use browser storage and therefore belong to that browser profile
and origin. Export important runs before clearing site data or moving to another
machine. Imports are validated for schema, engine compatibility, content-pack
identity, run identity, event order, statistics, and telemetry boundaries;
invalid bundles are rejected instead of partially loaded.

## Manage content packs

Open **Settings** to inspect the active content-pack identity and edit pack JSON.

1. Select a saved pack version or start from the built-in pack.
2. Edit **Content pack JSON**.
3. Review the reported field-level differences.
4. Select **Validate & save pack**.

Content-pack versions are immutable. A selected pack is used only by the next
world commit; an existing run retains the pack reference and checksum with
which it was created.

## Statuses and troubleshooting

| Status or symptom | Meaning and response |
| --- | --- |
| `starting` or **Loading World…** | The simulation worker is initializing. Wait for `paused` before issuing commands. |
| A command remains pending | The worker or persistence layer has not acknowledged it. Wait before repeating the command. |
| **Unavailable** | The current backend or projection does not expose that capability. It is intentionally not inferred by the UI. |
| **Partial**, **bounded**, or **truncated** | The displayed evidence has a projection limit. Narrow the scope or treat the view as a sample, not a complete aggregate. |
| **Stale** | A newer simulation frame exists than the displayed evidence. Refresh or wait for the current projection. |
| History gap or reconciliation warning | Persisted evidence is not a continuous committed prefix. Preserve the export and investigate before treating later evidence as complete. |
| Map appears lost after panning | Press `F` to fit the world, or select the minimap to recenter. |
| A world draft will not commit | Resolve validation errors and wait for a preview matching the current draft revision. |
| An import is rejected | Use an unmodified compatible export and check the displayed schema, engine, pack, or telemetry error. |

## Keyboard and accessibility notes

- Use the **Skip to workspace** link to bypass repeated header controls.
- Standard `Tab`, `Shift+Tab`, `Enter`, and `Space` navigation works throughout
  the workbench.
- Map and graph controls expose keyboard alternatives to pointer gestures.
- Focus follows cross-workspace actions so the selected evidence remains clear.
- The interface supports reduced motion, forced colors, visible focus, and
  responsive layouts without changing authoritative state.

## Current capability boundaries

The workbench favors explicit evidence over plausible-looking placeholders.
Controls that require an unimplemented backend command are disabled or labeled
unavailable. Projections may intentionally be bounded for performance, and the
interface identifies that limit. Presentation filters, panels, and navigation
never directly mutate canonical simulation state.

For deeper reference, see:

- [UI design system](UI_DESIGN_SYSTEM.md)
- [Workbench accessibility review](WORKBENCH_ACCESSIBILITY.md)
- [Epic 104 convergence audit](EPIC_104_CONVERGENCE.md)
- [Content-pack authoring](CONTENT_PACKS.md)
- [Hosted persistence operations](HOSTED_PERSISTENCE_OPERATIONS.md)
- [Roadmap and capability status](ROADMAP.md)
