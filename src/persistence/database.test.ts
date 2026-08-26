import { describe, expect, it } from 'vitest'
import { statisticStorageKey, validateImportedEvents, validateImportedStatistics } from './database'
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

describe('imported telemetry validation', () => {
  it('rejects evidence that belongs to another run before an import transaction starts', () => {
    expect(() => validateImportedEvents('run-a', [{ id: 'event-a', runId: 'run-b', tick: 1, type: 'CLOCK_ADVANCED', version: 1, payload: {} }])).toThrow('invalid event')
    expect(() => validateImportedStatistics('run-a', [{ runId: 'run-b', tick: 1, metricVersion: 1, metricId: 'population.count', scope: 'world', value: 10 }])).toThrow('invalid statistic')
  })

  it('accepts structurally valid evidence bound to the imported run', () => {
    expect(validateImportedEvents('run-a', [{ id: 'event-a', runId: 'run-a', tick: 1, type: 'CLOCK_ADVANCED', version: 1, payload: { hours: 1 } }])).toHaveLength(1)
    expect(validateImportedStatistics('run-a', [{ runId: 'run-a', tick: 1, metricVersion: 1, metricId: 'population.count', scope: 'world', value: 10 }])).toHaveLength(1)
  })
})
