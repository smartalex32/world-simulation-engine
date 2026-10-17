# Worldbuilder UI

The workbench implements the direction in [the approved mockup](worldbuilder-workflow-v1.png).

## Workflow

- **Build** opens a separate world draft. Set its name, seed and scale, then paint terrain, place settlements, define catchments, and draw roads. Elevation and renewable food capacity remain available in the map tools.
- **Populate** sets the detailed starting population and its zone allocations, settlement profiles, and optional distant cohorts. Next and Back preserve the same draft. Start simulation commits the validated preview through the existing worker.
- **Simulate & explore** returns to the live map. Playback and stepping use the existing simulation controls. Terrain, population and resource layers are available above the map; the full catalog opens additional layers and their evidence.
- Select a populated hex, then a person, or select a person from an event. The compact inspector shows their recorded activity, condition, dispositions, family links and recent events. Overview, Relationships and Life history open the corresponding detailed workspaces. Recorded details and explanations can also expand beside the map.
- The population timeline shows daily samples retained in the current session. Explore history opens persisted events, samples and checkpoints. History filtering does not rewind the simulation.

## Visual and data boundaries

The UI uses dark blue-green panels, warm serif titles, gold actions, teal selection, and deterministic canvas terrain illustration. Zoom controls preserve the map center; the distance bar derives its exact width from the world scale. Small screens put playback before the map and stack the inspection panels.

Person IDs, ages, occupations, variables and family links come from the projection. The avatar is a neutral silhouette. The mockup's fictional names, portraits, health/energy scores, configurable age mix, and food-duration presets are not represented as implemented simulation features. Actual hunger, fatigue and health stress values replace the illustrative condition bars. Terrain decoration follows projected cell data and does not add new biomes or change simulation state.

Existing entity, analytics, history, simulation diagnostics, save/import/export and content-pack tools remain accessible from the workbench navigation. No simulation schema, random-number generation, or authoritative model behavior changes are part of this UI branch.
