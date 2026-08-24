import type { WorldCreationDraft } from '../domain/types'
import { SimulationEngine } from './engine'

export const TEN_THOUSAND_PERSON_BENCHMARK = Object.freeze({
  population: 10_000,
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

function roundedMilliseconds(value: number): number {
  return Math.round(value * 100) / 100
}
