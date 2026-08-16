import { describe, expect, it } from 'vitest'
import { statisticStorageKey } from './database'
import { createWorldDraftRecord } from '../simulation/domain/worldDraft'
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

describe('world draft persistence contract', () => {
  it('uses detached versioned records rather than snapshot identity', () => {
    const draft = createWorldDraftRecord('draft-storage', {
      seed: 'draft-storage-seed', name: 'Draft storage', width: 32, height: 24, initialPopulationCount: 10,
      populationZones: [{ id: 'population-zone-0001', name: 'Initial', preset: 'center', populationCount: 10 }], settlements: [],
    })
    expect(draft).toMatchObject({ version: 2, draftId: 'draft-storage', revision: 0 })
    expect('runId' in draft).toBe(false)
  })
})
