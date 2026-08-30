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

/** Capability-only boundary used by the engine's fixed phase tuple.  It keeps
 * the authoritative façade out of phase handlers and makes cross-phase data
 * explicit and per-tick. */
export interface SimulationTickScratch {
  decisions?: unknown
  postActionActivityOccupancy?: unknown
}

export interface SimulationTickContext extends TickPhaseContext {
  readonly emit: () => void
  readonly operations: SimulationPhaseOperations
  readonly scratch: SimulationTickScratch
}

export interface SimulationPhaseOperations {
  clockAndLifecycle(context: SimulationTickContext): void
  needs(context: SimulationTickContext): void
  journeys(context: SimulationTickContext): void
  activitiesAndSchool(context: SimulationTickContext): void
  decisionsAndActions(context: SimulationTickContext): void
  encountersAndMarkets(context: SimulationTickContext): void
  exposureEnvironmentAndHealth(context: SimulationTickContext): void
  monthlyProcessing(context: SimulationTickContext): void
  annualProcessing(context: SimulationTickContext): void
  dailyProcessing(context: SimulationTickContext): void
}

const lifecycleMortality = 'life-cycle.mortality'
const lifecycleAnnual = ['life-cycle.partnership', 'life-cycle.birth', 'life-cycle.inheritance'] as const

/** This one tuple is both the executable contract and its public diagnostic. */
export const SIMULATION_TICK_PHASES: readonly DeterministicTickPhase<SimulationTickContext>[] = [
  { id: 'clock-and-lifecycle', cadence: 'hourly', rngStreams: [lifecycleMortality], run: (context) => context.operations.clockAndLifecycle(context) },
  { id: 'needs', cadence: 'hourly', rngStreams: [], run: (context) => context.operations.needs(context) },
  { id: 'journeys', cadence: 'hourly', rngStreams: [], run: (context) => context.operations.journeys(context) },
  { id: 'activities-and-school', cadence: 'hourly', rngStreams: ['school-attendance'], run: (context) => context.operations.activitiesAndSchool(context) },
  { id: 'decisions-and-actions', cadence: 'hourly', rngStreams: ['actions', 'innovation', 'content-pack.<pack>.<stream>'], run: (context) => context.operations.decisionsAndActions(context) },
  { id: 'encounters-and-markets', cadence: 'hourly', rngStreams: ['encounters'], run: (context) => context.operations.encountersAndMarkets(context) },
  { id: 'exposure-environment-and-health', cadence: 'hourly', rngStreams: ['fictional-pathogen'], run: (context) => context.operations.exposureEnvironmentAndHealth(context) },
  { id: 'monthly-processing', cadence: 'monthly', rngStreams: ['household-relocation'], run: (context) => context.operations.monthlyProcessing(context) },
  { id: 'annual-processing', cadence: 'annual', rngStreams: lifecycleAnnual, run: (context) => context.operations.annualProcessing(context) },
  { id: 'daily-processing-and-statistics', cadence: 'daily', rngStreams: [], run: (context) => context.operations.dailyProcessing(context) },
]

export const TICK_PHASE_MANIFEST = phaseManifest(SIMULATION_TICK_PHASES)
