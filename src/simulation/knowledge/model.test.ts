import { describe, expect, it } from 'vitest'
import { discoverLocalTerrain, harvestEfficiencyPermille, initialKnowledge, transmitKnowledge } from './model'
import type { PersonState } from '../domain/types'

function person(id: string, knowledge = initialKnowledge(30, 'forager')): PersonState {
  return { id, ageYears: 30, ageHoursIntoYear: 0, locationCellId: '0,0', homeCellId: '0,0', householdId: 'household-1', occupation: 'forager', activityScheduleId: 'activity.schedule.adult.v1', currentActivity: { kind: 'commons', locationId: 'activity.commons.0,0', sinceTick: 0 }, originTraces: [], development: { exposures: [] }, knowledge, variables: {} as PersonState['variables'], knownCellIds: ['0,0'] }
}

describe('knowledge model', () => {
  it('derives a bounded exploration discovery trace from curiosity', () => {
    const explorer = person('explorer', { 'knowledge.foraging': 0, 'knowledge.localTerrain': 990 })
    expect(discoverLocalTerrain(explorer, 900, 3)).toMatchObject({ source: 'exploration', previousValue: 990, gain: 10, currentValue: 1000 })
  })

  it('transmits only a meaningful knowledge gap through a trusting relationship', () => {
    const source = person('source', { 'knowledge.foraging': 800, 'knowledge.localTerrain': 60 })
    const recipient = person('recipient', { 'knowledge.foraging': 200, 'knowledge.localTerrain': 60 })
    expect(transmitKnowledge(source, recipient, 'knowledge.foraging', 500, 4)).toMatchObject({ source: 'peer-transmission', gain: 30, currentValue: 230, sourceValue: 800 })
    expect(transmitKnowledge(source, recipient, 'knowledge.localTerrain', 500, 4)).toBeUndefined()
  })

  it('uses foraging knowledge only as a bounded production multiplier', () => {
    expect(harvestEfficiencyPermille({ 'knowledge.foraging': 0, 'knowledge.localTerrain': 0 })).toBe(1000)
    expect(harvestEfficiencyPermille({ 'knowledge.foraging': 1000, 'knowledge.localTerrain': 0 })).toBe(1500)
  })
})
