/**
 * The authoritative tick order is deliberately data, not a plugin registry.
 *
 * `SimulationEngine` supplies the handlers for this tuple.  Content packs and
 * the UI cannot add, remove, or reorder phases; they can only provide data to
 * the systems named below.
 */
export type TickPhaseCadence = 'hourly' | 'daily' | 'monthly' | 'annual'

export interface TickPhaseManifestEntry {
  readonly id: string
  readonly cadence: TickPhaseCadence
  /** Named streams this phase may request.  An empty list means no RNG draws. */
  readonly rngStreams: readonly string[]
}

export interface TickPhaseContext {
  readonly tick: number
}

export interface DeterministicTickPhase<Context extends TickPhaseContext> extends TickPhaseManifestEntry {
  readonly run: (context: Context) => void
}

const cadenceMatches = (tick: number, cadence: TickPhaseCadence): boolean =>
  cadence === 'hourly'
    || (cadence === 'daily' && tick % 24 === 0)
    || (cadence === 'monthly' && tick % 720 === 0)
    || (cadence === 'annual' && tick % 8760 === 0)

/** Executes an already-created immutable tuple in declaration order. */
export const runStaticTickPipeline = <Context extends TickPhaseContext>(
  phases: readonly DeterministicTickPhase<Context>[],
  context: Context,
): void => {
  for (const phase of phases) if (cadenceMatches(context.tick, phase.cadence)) phase.run(context)
}

/** The engine-specific pipeline is assembled from this immutable definition;
 * the exported manifest is derived from the exact tuple that executes. */
export const phaseManifest = <Context extends TickPhaseContext>(phases: readonly DeterministicTickPhase<Context>[]): readonly TickPhaseManifestEntry[] =>
  phases.map(({ id, cadence, rngStreams }) => ({ id, cadence, rngStreams }))
