import { describe, expect, it } from 'vitest'
import { runTenThousandPersonBenchmark, TEN_THOUSAND_PERSON_BENCHMARK } from './scaleBenchmark'

describe('ten-thousand-person scale benchmark', () => {
  it('creates, advances, snapshots, and restores a detailed hosted-scale world deterministically', async () => {
    const result = await runTenThousandPersonBenchmark()
    expect(result.population).toBe(TEN_THOUSAND_PERSON_BENCHMARK.population)
    expect(result.digest).toBe(result.restoredDigest)
    expect(result.createMilliseconds).toBeGreaterThanOrEqual(0)
    expect(result.advanceMilliseconds).toBeGreaterThanOrEqual(0)
    expect(result.snapshotMilliseconds).toBeGreaterThanOrEqual(0)
    expect(result.livingPersonIndexBuilds).toBe(1)
  }, 60_000)
})
