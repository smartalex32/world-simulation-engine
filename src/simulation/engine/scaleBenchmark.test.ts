import { describe, expect, it } from 'vitest'
import {
  MIXED_FIDELITY_BENCHMARK,
  runMixedFidelityBenchmark,
  runMixedFidelityCadenceSmoke,
  runScheduledPhaseBenchmarks,
  runTenThousandPersonBenchmark,
  TEN_THOUSAND_PERSON_BENCHMARK,
} from './scaleBenchmark'

describe('ten-thousand-person scale benchmark', () => {
  it('creates, advances, snapshots, and restores a detailed hosted-scale world deterministically', async () => {
    const result = await runTenThousandPersonBenchmark()
    expect(result.population).toBe(TEN_THOUSAND_PERSON_BENCHMARK.population)
    expect(result.digest).toBe(result.restoredDigest)
    expect(result.snapshotBytes).toBeGreaterThan(result.compressedSnapshotBytes)
    expect(result.livingPersonIndexBuilds).toBe(1)
    expect(Object.keys(result.phaseMilliseconds)).toContain('decisions-and-actions')
  }, 60_000)

  it('measures the real hourly, daily, monthly, and annual phase paths without wall-clock budgets', async () => {
    const results = await runScheduledPhaseBenchmarks('scheduled-phase-smoke', 32)
    expect(results.map(({ phase }) => phase)).toEqual(['hourly', 'daily', 'monthly', 'annual'])
    expect(results.find(({ phase }) => phase === 'daily')?.phaseCounts['daily-processing-and-statistics']).toBe(1)
    expect(results.find(({ phase }) => phase === 'monthly')?.phaseCounts['monthly-processing']).toBe(1)
    expect(results.find(({ phase }) => phase === 'annual')?.phaseCounts['annual-processing']).toBe(1)
    expect(Object.keys(results.find(({ phase }) => phase === 'monthly')?.phaseMilliseconds ?? {})).toContain('monthly-processing')
    expect(results.find(({ phase }) => phase === 'monthly')?.relocationIndexBuilds).toBe(1)
  }, 60_000)

  it('preserves a 10k detailed and 100k cohort world through advance and restore', async () => {
    const result = await runMixedFidelityBenchmark()
    expect(result.population).toBe(MIXED_FIDELITY_BENCHMARK.detailedPopulation)
    expect(result.cohortPopulation).toBe(MIXED_FIDELITY_BENCHMARK.cohortPopulation)
    expect(result.digest).toBe(result.restoredDigest)
    expect(result.snapshotBytes).toBeGreaterThan(result.compressedSnapshotBytes)
    expect(result.livingPersonIndexBuilds).toBe(1)
  }, 60_000)

  it('exercises a mixed-fidelity month and representative multi-year boundaries', async () => {
    const results = await runMixedFidelityCadenceSmoke('mixed-cadence-smoke', 32, 100_000)
    expect(results.map(({ boundaryTick }) => boundaryTick)).toEqual([720, 8_760, 17_520])
    expect(results[0]?.phaseCounts['monthly-processing']).toBe(1)
    expect(results.slice(1).every(({ phaseCounts }) => phaseCounts['annual-processing'] === 1)).toBe(true)
    expect(results.map(({ relocationIndexBuilds }) => relocationIndexBuilds)).toEqual([1, 0, 0])
  }, 60_000)
})
