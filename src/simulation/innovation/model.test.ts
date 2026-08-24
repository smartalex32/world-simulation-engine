import { describe, expect, it } from 'vitest'
import { Pcg32, hashSeed } from '../rng/pcg32'
import type { PersonState } from '../domain/types'
import { attemptPracticalExperiment, techniqueHarvestBonusPermille } from './model'

function person(knowledge: number): PersonState { return { id: 'person-1', ageYears: 30, ageHoursIntoYear: 0, locationCellId: '0,0', homeCellId: '0,0', householdId: 'household-1', activityScheduleId: 'activity.schedule.adult.v1', currentActivity: { kind: 'commons', locationId: 'activity.commons.0,0', sinceTick: 0 }, originTraces: [], development: { exposures: [] }, knowledge: { 'knowledge.foraging': knowledge, 'knowledge.localTerrain': 0 }, variables: {} as PersonState['variables'], knownCellIds: ['0,0'] } }
describe('practical innovation', () => {
  it('requires both knowledge and a material tool', () => {
    expect(attemptPracticalExperiment(person(499), { food: 0, tools: 1 }, 1, new Pcg32(hashSeed('a')))).toBeUndefined()
    expect(attemptPracticalExperiment(person(900), { food: 0, tools: 0 }, 1, new Pcg32(hashSeed('a')))).toBeUndefined()
  })
  it('creates bounded provenance and affects only the inventor work path', () => {
    const inventor = person(1000); const inventory = { food: 0, tools: 1 }
    let technique
    for (let seed = 0; !technique; seed += 1) technique = attemptPracticalExperiment(inventor, inventory, 24, new Pcg32(hashSeed(`innovation-${seed}`)))
    expect(technique).toMatchObject({ id: 'technique.foraging.efficient-harvest', personId: inventor.id, toolCost: 1 })
    expect(inventory.tools).toBe(0)
    expect(techniqueHarvestBonusPermille(inventor)).toBe(150)
    expect(techniqueHarvestBonusPermille(person(1000))).toBe(0)
  })
})
