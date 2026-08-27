import type { WorldCreationDraft } from '../domain/types'
import { SimulationEngine } from './engine'

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
  livingPersonIndexBuilds: number
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
  engine.advance(TEN_THOUSAND_PERSON_BENCHMARK.simulatedHours)
  const advanceMilliseconds = performance.now() - advancedAt
  const { livingPersonIndexBuilds } = engine.performanceDiagnostics()
  const snapshottedAt = performance.now()
  const snapshot = await engine.snapshot()
  const snapshotMilliseconds = performance.now() - snapshottedAt

  const restored = await SimulationEngine.restore(snapshot)
  const restoredSnapshot = await restored.snapshot()
  return {
    ...TEN_THOUSAND_PERSON_BENCHMARK,
    createMilliseconds: roundedMilliseconds(createMilliseconds),
    advanceMilliseconds: roundedMilliseconds(advanceMilliseconds),
    snapshotMilliseconds: roundedMilliseconds(snapshotMilliseconds),
    livingPersonIndexBuilds,
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
  engine.advance(MIXED_FIDELITY_BENCHMARK.simulatedHours)
  const advanceMilliseconds = performance.now() - advancedAt
  const { livingPersonIndexBuilds } = engine.performanceDiagnostics()
  const snapshottedAt = performance.now()
  const snapshot = await engine.snapshot()
  const snapshotMilliseconds = performance.now() - snapshottedAt
  const restoredDigest = (await (await SimulationEngine.restore(snapshot)).snapshot()).digest
  return { population: MIXED_FIDELITY_BENCHMARK.detailedPopulation, cohortPopulation: MIXED_FIDELITY_BENCHMARK.cohortPopulation, width: MIXED_FIDELITY_BENCHMARK.width, height: MIXED_FIDELITY_BENCHMARK.height, simulatedHours: MIXED_FIDELITY_BENCHMARK.simulatedHours, createMilliseconds: roundedMilliseconds(createMilliseconds), advanceMilliseconds: roundedMilliseconds(advanceMilliseconds), snapshotMilliseconds: roundedMilliseconds(snapshotMilliseconds), livingPersonIndexBuilds, digest: snapshot.digest, restoredDigest }
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
