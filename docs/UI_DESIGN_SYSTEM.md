# Workbench UI design system

The browser workbench uses a dark analytical surface language. The token set in
`src/styles.css` owns the palette, type, spacing, radii, elevation, focus ring,
semantic state colours, chart series, and z-index layering. Components must use
these tokens rather than introduce one-off visual values when an equivalent
token exists.

`src/ui/layout/WorkbenchShell.tsx` owns the global landmark structure,
navigation, status readout, and three-region workspace boundary. Workspace
contents remain projections and controllers supplied by `App.tsx`; the shell
does not import simulation internals or mutate authoritative state.

`src/ui/components/WorkbenchPrimitives.tsx` provides the common panel title,
metric, card, toolbar, tab, and availability-state vocabulary. State messages
must say **Not modeled** or **Unavailable** for unsupported capabilities and
must never invent projected data.

`src/ui/controllers/useWorkbenchNavigation.ts` is the single owner of
cross-workspace presentation context. Entity references and URL fields are
validated before use, browser back/forward restores presentation state only,
and run changes clear entity-specific context. Selection and bounded map focus
remain distinct from authoritative protected-person commands.

At desktop widths the workbench is controls, primary canvas, and inspector. At
820px and below it stacks controls, primary, and inspector. This retains one
coherent visual and keyboard reading order while avoiding page-level horizontal
scrolling. The skip link, landmarks, visible focus ring, labels, headings, and
polite status messages are part of the shell contract.

## Visualization layer

`src/ui/visualization` is a dependency-free presentation layer. It consumes
typed projection and retained-history values only; it does not import engine
state or perform authoritative aggregation. Keeping it dependency-free avoids
additional bundle, license, maintenance, SSR, and tree-shaking risk while the
required SVG and bounded HTML interactions remain small.

The layer centralizes unit formatting, numeric domains, gaps, stable keys,
deterministic presentation layout, accessible text/table alternatives, and the
shared available/empty/partial/gapped/stale/unavailable vocabulary. Absence is
never formatted as zero. Colors are supplemented by labels, patterns, signs,
or text.

Browser rendering budgets are 64 sparkline points, 256 line-series points, 80
graph nodes, 240 graph edges, and 24 categorical bars. Adapters expose original
counts and visible sampled/truncated evidence. These are rendering limits, not
authoritative world or history query limits. Stable graph layout is derived
from sorted IDs and never consumes simulation RNG.
