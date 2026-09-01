import type { SimulationState, WorldCreationDraft } from '../domain/types'
import { DEFAULT_PREINDUSTRIAL_PACK } from '../../contentPacks/defaultPreindustrial'
import { createContentPackRuntime } from '../../contentPacks/runtime'
import { validateCanonicalSimulationState } from '../validation/canonicalState'
import { SimulationEngine } from './engine'
import { canonicalStringify } from '../../shared/canonicalJson'

const validationRuntime = createContentPackRuntime(DEFAULT_PREINDUSTRIAL_PACK)

export const TEN_THOUSAND_PERSON_BENCHMARK = Object.freeze({
  population: 10_000,
  width: 128,
  height: 128,
  simulatedHours: 1,
})

export const MIXED_FIDELITY_BENCHMARK = Object.freeze({
  detailedPopulation: 10_000,
  cohortPopulation: 100_000,
  width: 128,
  height: 128,
  simulatedHours: 1,
})

export interface ScaleBenchmarkResult {
  population: number
  width: number
  height: number
  simulatedHours: number
  createMilliseconds: number
  advanceMilliseconds: number
  snapshotMilliseconds: number
  validationMilliseconds: number
  projectionMilliseconds: number
  restorationMilliseconds: number
  compressionMilliseconds: number
  snapshotBytes: number
  compressedSnapshotBytes: number
  livingPersonIndexBuilds: number
  phaseMilliseconds: Readonly<Record<string, number>>
  digest: string
  restoredDigest: string
}

/**
 * Deterministic, host-sized detailed-agent workload. Timing is deliberately
 * reported rather than asserted: runner hardware is not authoritative state.
 */
export async function runTenThousandPersonBenchmark(seed = 'scale-10k-v1'): Promise<ScaleBenchmarkResult> {
  const draft = tenThousandPersonBenchmarkDraft(seed)
  const createdAt = performance.now()
  const engine = SimulationEngine.create(draft)
  const createMilliseconds = performance.now() - createdAt
  const advancedAt = performance.now()
  const advanceResult = engine.advance(TEN_THOUSAND_PERSON_BENCHMARK.simulatedHours, { measurePhaseMilliseconds: true })
  const advanceMilliseconds = performance.now() - advancedAt
  const { livingPersonIndexBuilds } = engine.performanceDiagnostics()
  const snapshottedAt = performance.now()
  const snapshot = await engine.snapshot()
  const snapshotMilliseconds = performance.now() - snapshottedAt
  const validatedAt = performance.now()
  validateCanonicalSimulationState(snapshot.state, validationRuntime)
  const validationMilliseconds = performance.now() - validatedAt

  const projectionAt = performance.now()
  engine.project()
  const projectionMilliseconds = performance.now() - projectionAt
  const serialized = new TextEncoder().encode(canonicalStringify(snapshot))
  const compressedAt = performance.now()
  const compressedSnapshotBytes = (await gzip(serialized)).byteLength
  const compressionMilliseconds = performance.now() - compressedAt
  const restoredAt = performance.now()
  const restored = await SimulationEngine.restore(snapshot)
  const restorationMilliseconds = performance.now() - restoredAt
  const restoredSnapshot = await restored.snapshot()
  return {
    ...TEN_THOUSAND_PERSON_BENCHMARK,
    createMilliseconds: roundedMilliseconds(createMilliseconds),
    advanceMilliseconds: roundedMilliseconds(advanceMilliseconds),
    snapshotMilliseconds: roundedMilliseconds(snapshotMilliseconds),
    validationMilliseconds: roundedMilliseconds(validationMilliseconds),
    projectionMilliseconds: roundedMilliseconds(projectionMilliseconds),
    restorationMilliseconds: roundedMilliseconds(restorationMilliseconds),
    compressionMilliseconds: roundedMilliseconds(compressionMilliseconds),
    snapshotBytes: serialized.byteLength,
    compressedSnapshotBytes,
    livingPersonIndexBuilds,
    phaseMilliseconds: roundedPhaseMilliseconds(advanceResult.diagnostics.phaseMilliseconds),
    digest: snapshot.digest,
    restoredDigest: restoredSnapshot.digest,
  }
}

/** The mixed-fidelity acceptance workload retains 100k people as one
 * authoritative cohort while exercising the full 10k detailed-person path. */
export async function runMixedFidelityBenchmark(seed = 'scale-10k-plus-100k-v1'): Promise<ScaleBenchmarkResult & { cohortPopulation: number }> {
  const draft = mixedFidelityBenchmarkDraft(seed)
  const createdAt = performance.now()
  const engine = SimulationEngine.create(draft)
  const createMilliseconds = performance.now() - createdAt
  const advancedAt = performance.now()
  const advanceResult = engine.advance(MIXED_FIDELITY_BENCHMARK.simulatedHours, { measurePhaseMilliseconds: true })
  const advanceMilliseconds = performance.now() - advancedAt
  const { livingPersonIndexBuilds } = engine.performanceDiagnostics()
  const snapshottedAt = performance.now()
  const snapshot = await engine.snapshot()
  const snapshotMilliseconds = performance.now() - snapshottedAt
  const validatedAt = performance.now()
  validateCanonicalSimulationState(snapshot.state, validationRuntime)
  const validationMilliseconds = performance.now() - validatedAt
  const projectionAt = performance.now()
  engine.project()
  const projectionMilliseconds = performance.now() - projectionAt
  const serialized = new TextEncoder().encode(canonicalStringify(snapshot))
  const compressedAt = performance.now()
  const compressedSnapshotBytes = (await gzip(serialized)).byteLength
  const compressionMilliseconds = performance.now() - compressedAt
  const restoredAt = performance.now()
  const restored = await SimulationEngine.restore(snapshot)
  const restorationMilliseconds = performance.now() - restoredAt
  const restoredDigest = (await restored.snapshot()).digest
  return {
    population: MIXED_FIDELITY_BENCHMARK.detailedPopulation,
    cohortPopulation: MIXED_FIDELITY_BENCHMARK.cohortPopulation,
    width: MIXED_FIDELITY_BENCHMARK.width,
    height: MIXED_FIDELITY_BENCHMARK.height,
    simulatedHours: MIXED_FIDELITY_BENCHMARK.simulatedHours,
    createMilliseconds: roundedMilliseconds(createMilliseconds),
    advanceMilliseconds: roundedMilliseconds(advanceMilliseconds),
    snapshotMilliseconds: roundedMilliseconds(snapshotMilliseconds),
    validationMilliseconds: roundedMilliseconds(validationMilliseconds),
    projectionMilliseconds: roundedMilliseconds(projectionMilliseconds),
    restorationMilliseconds: roundedMilliseconds(restorationMilliseconds),
    compressionMilliseconds: roundedMilliseconds(compressionMilliseconds),
    snapshotBytes: serialized.byteLength,
    compressedSnapshotBytes,
    livingPersonIndexBuilds,
    phaseMilliseconds: roundedPhaseMilliseconds(advanceResult.diagnostics.phaseMilliseconds),
    digest: snapshot.digest,
    restoredDigest,
  }
}

export interface ScheduledPhaseBenchmarkResult {
  phase: 'hourly' | 'daily' | 'monthly' | 'annual'
  boundaryTick: number
  advanceMilliseconds: number
  phaseCounts: Readonly<Record<string, number>>
  phaseMilliseconds: Readonly<Record<string, number>>
  livingPersonIndexBuilds: number
  relocationIndexBuilds: number
  relocationPathExpansions: number
  digest: string
}

/** Executes each cadence from an independently restored base snapshot, then
 * positions the benchmark-only engine clock immediately before the boundary.
 * This avoids thousands of irrelevant warm-up hours while still running the
 * real phase tuple and validating the resulting snapshot. */
export async function runScheduledPhaseBenchmarks(seed = 'scheduled-phase-scale-v1', population = 1_000): Promise<readonly ScheduledPhaseBenchmarkResult[]> {
  const base = await SimulationEngine.create({
    ...tenThousandPersonBenchmarkDraft(seed),
    initialPopulationCount: population,
    width: 64,
    height: 64,
  }).snapshot()
  const boundaries = [['hourly', 1], ['daily', 24], ['monthly', 720], ['annual', 8760]] as const
  return runBoundaryBenchmarks(base, boundaries)
}

/** Exercises long-horizon cadence boundaries with detailed people and a large
 * aggregate cohort. Each boundary remains independent so wall-clock timing is
 * diagnostic evidence rather than an input to authoritative behavior. */
export async function runMixedFidelityCadenceSmoke(
  seed = 'mixed-fidelity-cadence-v1',
  detailedPopulation = 1_000,
  cohortPopulation = MIXED_FIDELITY_BENCHMARK.cohortPopulation,
): Promise<readonly ScheduledPhaseBenchmarkResult[]> {
  const draft = mixedFidelityBenchmarkDraft(seed)
  draft.initialPopulationCount = detailedPopulation
  draft.populationZones[0]!.populationCount = detailedPopulation
  draft.populationZones[1]!.cohortPopulationCount = cohortPopulation
  const base = await SimulationEngine.create(draft).snapshot()
  return runBoundaryBenchmarks(base, [
    ['monthly', 720],
    ['annual', 8_760],
    ['annual', 17_520],
  ])
}

export function tenThousandPersonBenchmarkDraft(seed = 'scale-10k-v1'): WorldCreationDraft {
  return {
    seed,
    name: 'Ten Thousand Person Benchmark',
    width: TEN_THOUSAND_PERSON_BENCHMARK.width,
    height: TEN_THOUSAND_PERSON_BENCHMARK.height,
    initialPopulationCount: TEN_THOUSAND_PERSON_BENCHMARK.population,
    terrainBase: 'blank-land',
    populationZones: [],
    settlements: [],
    roads: [],
    terrainOverrides: [],
    elevationOverrides: [],
    resourceCapacityOverrides: [],
  }
}

export function mixedFidelityBenchmarkDraft(seed = 'scale-10k-plus-100k-v1'): WorldCreationDraft {
  return {
    seed,
    name: 'Ten Thousand Detailed Plus One Hundred Thousand Cohort Benchmark',
    width: MIXED_FIDELITY_BENCHMARK.width,
    height: MIXED_FIDELITY_BENCHMARK.height,
    initialPopulationCount: MIXED_FIDELITY_BENCHMARK.detailedPopulation,
    terrainBase: 'blank-land',
    populationZones: [
      { id: 'detailed', name: 'Detailed population', cellIds: ['0,0'], populationCount: MIXED_FIDELITY_BENCHMARK.detailedPopulation },
      { id: 'cohort', name: 'Distant cohort', cellIds: ['127,127'], populationCount: 0, cohortPopulationCount: MIXED_FIDELITY_BENCHMARK.cohortPopulation },
    ],
    settlements: [], roads: [], terrainOverrides: [], elevationOverrides: [], resourceCapacityOverrides: [],
  }
}

function roundedMilliseconds(value: number): number {
  return Math.round(value * 100) / 100
}

async function runBoundaryBenchmarks(
  base: Awaited<ReturnType<SimulationEngine['snapshot']>>,
  boundaries: readonly (readonly [ScheduledPhaseBenchmarkResult['phase'], number])[],
): Promise<readonly ScheduledPhaseBenchmarkResult[]> {
  const results: ScheduledPhaseBenchmarkResult[] = []
  for (const [phase, boundaryTick] of boundaries) {
    const engine = await SimulationEngine.restore(base)
    positionBenchmarkEngineAtBoundary(engine, boundaryTick)
    const startedAt = performance.now()
    const result = engine.advance(1, { clockEventHours: false, measurePhaseMilliseconds: true })
    const advanceMilliseconds = performance.now() - startedAt
    results.push({
      phase,
      boundaryTick,
      advanceMilliseconds: roundedMilliseconds(advanceMilliseconds),
      phaseCounts: result.diagnostics.phaseCounts,
      phaseMilliseconds: roundedPhaseMilliseconds(result.diagnostics.phaseMilliseconds),
      livingPersonIndexBuilds: result.diagnostics.livingPersonIndexBuilds,
      relocationIndexBuilds: result.diagnostics.relocationIndexBuilds,
      relocationPathExpansions: result.diagnostics.relocationPathExpansions,
      digest: (await engine.snapshot()).digest,
    })
  }
  return Object.freeze(results)
}

function positionBenchmarkEngineAtBoundary(engine: SimulationEngine, boundaryTick: number): void {
  type MutableDevelopmentWindow = { windowStartTick: number }
  type BenchmarkEngineInternals = {
    state: SimulationState
    communityCountersById: Map<string, { windowStartTick: number; windowEndTick: number }>
  }

  const internals = engine as unknown as BenchmarkEngineInternals
  const priorTick = boundaryTick - 1
  const dailyWindowStart = Math.floor(priorTick / 24) * 24 + 1
  const developmentWindowStart = Math.floor(priorTick / 720) * 720 + 1
  internals.state.tick = priorTick
  for (const counters of internals.communityCountersById.values()) {
    counters.windowStartTick = dailyWindowStart
    counters.windowEndTick = dailyWindowStart + 23
  }
  for (const person of internals.state.people) {
    for (const exposure of person.development.exposures as MutableDevelopmentWindow[]) {
      exposure.windowStartTick = developmentWindowStart
    }
    for (const exposure of person.development.broader?.exposures as MutableDevelopmentWindow[] ?? []) {
      exposure.windowStartTick = developmentWindowStart
    }
  }
}

function roundedPhaseMilliseconds(values: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(Object.entries(values).map(([phaseId, milliseconds]) => [phaseId, roundedMilliseconds(milliseconds)])))
}

async function gzip(value: Uint8Array): Promise<ArrayBuffer> {
  const bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}
