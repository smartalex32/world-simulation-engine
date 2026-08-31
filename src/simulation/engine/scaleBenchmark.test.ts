import { describe, expect, it } from 'vitest'
import { MIXED_FIDELITY_BENCHMARK, runMixedFidelityBenchmark, runTenThousandPersonBenchmark, TEN_THOUSAND_PERSON_BENCHMARK } from './scaleBenchmark'

describe('ten-thousand-person scale benchmark', () => {
  it('creates, advances, snapshots, and restores a detailed hosted-scale world deterministically', async () => {
    const result = await runTenThousandPersonBenchmark()
    expect(result.population).toBe(TEN_THOUSAND_PERSON_BENCHMARK.population)
    expect(result.digest).toBe(result.restoredDigest)
    expect(result.createMilliseconds).toBeGreaterThanOrEqual(0)
    expect(result.advanceMilliseconds).toBeGreaterThanOrEqual(0)
    expect(result.snapshotMilliseconds).toBeGreaterThanOrEqual(0)
    expect(result.validationMilliseconds).toBeGreaterThanOrEqual(0)
    expect(result.livingPersonIndexBuilds).toBe(1)
  }, 60_000)

  it('preserves a 10k detailed and 100k cohort world through advance and restore', async () => {
    const result = await runMixedFidelityBenchmark()
    expect(result.population).toBe(MIXED_FIDELITY_BENCHMARK.detailedPopulation)
    expect(result.cohortPopulation).toBe(MIXED_FIDELITY_BENCHMARK.cohortPopulation)
    expect(result.digest).toBe(result.restoredDigest)
    expect(result.validationMilliseconds).toBeGreaterThanOrEqual(0)
    expect(result.livingPersonIndexBuilds).toBe(1)
  }, 60_000)
})
