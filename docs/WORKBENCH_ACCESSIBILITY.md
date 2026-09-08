# Workbench browser, input, and accessibility matrix

The supported browser contract is the current Playwright-pinned Chromium,
Firefox, and WebKit release. CI runs every Chromium flow on pull requests and
the critical fixed-seed and accessibility journeys in all three engines. The
scheduled workflow runs the complete suite in all three engines.

| Surface | Keyboard | Pointer/touch | Evidence alternative | Bounded rendering |
| --- | --- | --- | --- | --- |
| Global shell | Skip link, sequential navigation, Enter/Space | 44 px coarse-pointer targets | Landmarks, headings, live run status | Seven fixed workspace routes |
| Person | Section links and action buttons | Stacked mobile actions | Structured headings, metrics, and lists | Bounded person projection |
| Relationships | Arrow-key node movement, zoom/reset, details table | Pan/select controls | Complete bounded node/edge table | 80 nodes / 240 edges |
| History | Range fields, presets, marker buttons, previous/next | Scrollable spatial lane | Exact event payload table and metric sample tables | 200 queried events / 256 series points |
| Map | Arrows/WASD, +/- zoom, F fit, minimap Enter/Space | Drag, wheel, click, minimap | Layer catalog, render-status text, inspector evidence | Projection LOD and primitive/marker budgets |
| Simulation | Typed-command buttons, labeled seed and speed fields | Responsive primary controls | Polite command states and error alerts | 32 diagnostic timing points |
| Analytics | Labeled filters, card and drill-down buttons | Single-column mobile cards | Values, delta text, state text, sample tables | Registry cards and sampled series |

## Reflow and visual review

Automated checks cover 1440 px desktop artifacts and page-level reflow at 1024,
768, 390, and 320 CSS pixels. At 320 px and browser 200% zoom, ordinary content
uses one-dimensional page flow. Intrinsically spatial map, graph, and timeline
regions may scroll or pan within their own boundary and expose structured text
or table evidence for the same retained data.

The local quality run on 2026-09-08 passed all keyboard, DOM naming/reference,
320 px reflow, and bounded-render checks in Chromium, Firefox, and WebKit. The
Chromium preference test also passed with reduced motion and forced colors
active. CI repeats critical checks and the scheduled workflow repeats the full
cross-browser suite.

`tests/e2e/visualBaselines.ts` owns the reviewed populated, empty, partial,
unavailable, and error routes. The quality suite captures each route as a
full-page Chromium artifact with animations disabled; changes to that manifest
or the images require deliberate screenshot review. PR screenshots are review
media and are not committed to the repository.

## Non-color and preference support

State always includes text; negative graph edges and sampled timeline evidence
also use patterns. The forced-colors stylesheet restores system borders and
text, while reduced-motion preferences collapse animation and transition time.
Canvas color remains a presentation aid; its live LOD description and adjacent
inspectors carry the accessible evidence contract.

## Known boundaries

- Browser-generated chronicle text is deterministic formatting of retained
  events, not an alternative authoritative history.
- Hosted lease/reconciliation health is unavailable in the local workbench.
- Aggregate health, factions, organized warfare, replay, and branch comparison
  remain visibly unavailable until their named backend issues land.
- Automated DOM checks cover critical naming, references, duplicate IDs, and
  landmarks. Keyboard, reflow, dark-theme, forced-colors, and screenshot review
  remain explicit human review responsibilities in addition to automation.
