import type { ContentPackRuntime } from '../../contentPacks'
import type { ActionDecision, AuthoritativeChangeSet, PersonState, SimulationEvent, SimulationState, StatisticSample } from '../domain/types'
import type { RandomProvider } from '../rng/pcg32'

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
  /** Noncanonical bounded diagnostic counters; never authoritative state. */
  readonly phaseCounts?: Record<string, number>
  /** Optional noncanonical timing wrapper supplied only by diagnostic hosts. */
  readonly measurePhase?: (phaseId: string, operation: () => void) => void
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
const runStaticTickPipeline = <Context extends TickPhaseContext>(
  phases: readonly DeterministicTickPhase<Context>[],
  context: Context,
): void => {
  for (const phase of phases) if (cadenceMatches(context.tick, phase.cadence)) {
    if (context.phaseCounts) context.phaseCounts[phase.id] = (context.phaseCounts[phase.id] ?? 0) + 1
    if (context.measurePhase) context.measurePhase(phase.id, () => phase.run(context))
    else phase.run(context)
  }
}

/** The engine-specific pipeline is assembled from this immutable definition;
 * the exported manifest is derived from the exact tuple that executes. */
const phaseManifest = <Context extends TickPhaseContext>(phases: readonly DeterministicTickPhase<Context>[]): readonly TickPhaseManifestEntry[] =>
  phases.map(({ id, cadence, rngStreams }) => ({ id, cadence, rngStreams }))

/** Capability-only boundary used by the engine's fixed phase tuple.  It keeps
 * the authoritative façade out of phase handlers and makes cross-phase data
 * explicit and per-tick. */
export interface SimulationTickScratch {
  decisions?: readonly { person: PersonState; decision: ActionDecision }[]
  postActionActivityOccupancy?: ReadonlyMap<string, readonly string[]>
}

export interface SimulationTickContext extends TickPhaseContext {
  readonly state: SimulationState
  readonly random: RandomProvider
  readonly content: ContentPackRuntime
  readonly emit: (event: SimulationEvent) => void
  readonly record: (sample: StatisticSample) => void
  readonly invalidate: (categories: readonly AuthoritativeChangeSet['categories'][number][], cellIds?: readonly string[]) => void
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
  organizationLifecycle(context: SimulationTickContext): void
  monthlyProcessing(context: SimulationTickContext): void
  annualProcessing(context: SimulationTickContext): void
  dailyProcessing(context: SimulationTickContext): void
}

const lifecycleMortality = 'life-cycle.mortality'
const lifecycleAnnual = ['life-cycle.partnership', 'life-cycle.birth', 'life-cycle.inheritance'] as const
const defineSimulationPhase = (phase: DeterministicTickPhase<SimulationTickContext>): DeterministicTickPhase<SimulationTickContext> =>
  Object.freeze({ ...phase, rngStreams: Object.freeze([...phase.rngStreams]) })

/** This one tuple is both the executable contract and its public diagnostic. */
const SIMULATION_TICK_PHASES = Object.freeze([
  defineSimulationPhase({ id: 'clock-and-lifecycle', cadence: 'hourly', rngStreams: [lifecycleMortality], run: (context) => context.operations.clockAndLifecycle(context) }),
  defineSimulationPhase({ id: 'needs', cadence: 'hourly', rngStreams: [], run: (context) => context.operations.needs(context) }),
  defineSimulationPhase({ id: 'journeys', cadence: 'hourly', rngStreams: [], run: (context) => context.operations.journeys(context) }),
  defineSimulationPhase({ id: 'activities-and-school', cadence: 'hourly', rngStreams: ['organization.school.attendance'], run: (context) => context.operations.activitiesAndSchool(context) }),
  defineSimulationPhase({ id: 'decisions-and-actions', cadence: 'hourly', rngStreams: ['actions', 'innovation.practical-experiment', 'content-pack.<pack>.<stream>'], run: (context) => context.operations.decisionsAndActions(context) }),
  defineSimulationPhase({ id: 'encounters-and-markets', cadence: 'hourly', rngStreams: ['encounters'], run: (context) => context.operations.encountersAndMarkets(context) }),
  defineSimulationPhase({ id: 'exposure-environment-and-health', cadence: 'hourly', rngStreams: ['health.fictional-pathogen'], run: (context) => context.operations.exposureEnvironmentAndHealth(context) }),
  defineSimulationPhase({ id: 'organization-lifecycle', cadence: 'daily', rngStreams: ['organization.lifecycle'], run: (context) => context.operations.organizationLifecycle(context) }),
  defineSimulationPhase({ id: 'monthly-processing', cadence: 'monthly', rngStreams: ['household.relocation'], run: (context) => context.operations.monthlyProcessing(context) }),
  defineSimulationPhase({ id: 'annual-processing', cadence: 'annual', rngStreams: lifecycleAnnual, run: (context) => context.operations.annualProcessing(context) }),
  defineSimulationPhase({ id: 'daily-processing-and-statistics', cadence: 'daily', rngStreams: [], run: (context) => context.operations.dailyProcessing(context) }),
]) as readonly DeterministicTickPhase<SimulationTickContext>[]

/** The only executable entry point; consumers never receive the phase tuple. */
export const runSimulationTickPipeline = (context: SimulationTickContext): void => runStaticTickPipeline(SIMULATION_TICK_PHASES, context)

export const TICK_PHASE_MANIFEST = Object.freeze(phaseManifest(SIMULATION_TICK_PHASES).map((phase) => Object.freeze({ ...phase, rngStreams: Object.freeze([...phase.rngStreams]) })))
