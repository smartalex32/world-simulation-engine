import { describe, expect, it } from 'vitest'
import { planCohortMaterialization } from './transitions'

const cohort = { version: 1 as const, id: 'cohort:west', sourceZoneId: 'west', populationCount: 10, householdCount: 4, foodUnits: 12, cellAllocations: [{ cellId: '1,1', populationCount: 6 }, { cellId: '1,2', populationCount: 4 }], ageBands: { children: 2, adults: 7, elders: 1 }, eventTotals: { births: 0, deaths: 0, migrationIn: 0, migrationOut: 0 } }

describe('cohort materialization planning', () => {
  it('plans deterministic bounded allocations without mutating the cohort', () => {
    expect(planCohortMaterialization(cohort, 5)).toMatchObject({ status: 'ready', requestedPopulationCount: 5, availablePopulationCount: 10, materializablePopulationCount: 5, residualPopulationCount: 5, cellAllocations: [{ cellId: '1,1', populationCount: 3 }, { cellId: '1,2', populationCount: 2 }] })
    expect(cohort.populationCount).toBe(10)
  })

  it('blocks automatic transition when hooked or otherwise protected detail is present', () => {
    expect(planCohortMaterialization(cohort, 5, ['person-0002', 'person-0001', 'person-0002'])).toMatchObject({ status: 'protected-detail-present', materializablePopulationCount: 0, residualPopulationCount: 10, protectedDetailedPersonIds: ['person-0001', 'person-0002'], cellAllocations: [] })
  })
})
