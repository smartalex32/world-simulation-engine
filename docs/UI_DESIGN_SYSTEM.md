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

At desktop widths the workbench is controls, primary canvas, and inspector. At
820px and below it stacks controls, primary, and inspector. This retains one
coherent visual and keyboard reading order while avoiding page-level horizontal
scrolling. The skip link, landmarks, visible focus ring, labels, headings, and
polite status messages are part of the shell contract.
