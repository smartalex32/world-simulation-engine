import { describe, expect, it } from 'vitest'
import { statisticStorageKey } from './database'
import type { StatisticSample } from '../simulation/domain/types'

describe('statistic storage identity', () => {
  it('keeps world and each community scope collision-free', () => {
    const base = { runId: 'run-a', tick: 24, metricVersion: 1 as const, value: 500 }
    const west: StatisticSample = { ...base, scope: 'community', scopeId: 'community-west-valley', metricId: 'community.emergent.socialTrust' }
    const east: StatisticSample = { ...base, scope: 'community', scopeId: 'community-east-valley', metricId: 'community.emergent.socialTrust' }
    const world: StatisticSample = { ...base, scope: 'world', metricId: 'social.averageFamiliarity' }

    expect(new Set([statisticStorageKey(west), statisticStorageKey(east), statisticStorageKey(world)])).toHaveLength(3)
    expect(statisticStorageKey(west)).toBe('run-a:community:community-west-valley:community.emergent.socialTrust:24')
    expect(statisticStorageKey(world)).toBe('run-a:world:world:social.averageFamiliarity:24')
  })
})
