import { describe, expect, it } from 'vitest'
import { WorkbenchProjectionBuilder } from '../../projection/buildMapProjection'
import { SimulationEngine } from '../engine/engine'
import { advanceCohortsDaily } from './model'
import { defaultWorldCreationRequest } from '../domain/worldCreation'

describe('authoritative population cohorts', () => {
  it('advances the retained cohort food ledger deterministically without changing represented people', () => {
    const cohorts = [{ version: 2 as const, id: 'cohort:west', sourceZoneId: 'west', populationCount: 12, householdCount: 4, foodUnits: 5, cellAllocations: [{ cellId: '0,0', populationCount: 12 }], ageBands: { children: 2, adults: 9, elders: 1 }, economicProductivityPermille: 1000, culturalCohesionPermille: 500, developmentIndexPermille: 500, eventTotals: { births: 0, deaths: 0, migrationIn: 0, migrationOut: 0 } }]
    const cells = [{ id: '0,0', q: 0, r: 0, terrain: 'plain' as const, elevation: 0, habitability: 1000, movementCost: 1000, resourceCapacity: 100, foodAmount: 10, foodRegenerationPerDay: 1 }]
    advanceCohortsDaily(cohorts, cells)
    expect(cohorts[0]).toMatchObject({ populationCount: 12, householdCount: 4, foodUnits: 2, culturalCohesionPermille: 498, developmentIndexPermille: 499, cellAllocations: [{ cellId: '0,0', populationCount: 12 }] })
    expect(cells[0]?.foodAmount).toBe(9)
  })

  it('retains a hundred-thousand-person distant allocation exactly without creating detailed agents', async () => {
    const draft = {
      ...defaultWorldCreationRequest('cohort-ledger-seed'),
      initialPopulationCount: 2,
      populationZones: [
        { id: 'west', name: 'West', preset: 'west' as const, radiusCells: 3, populationCount: 1, cohortPopulationCount: 100_000, cohortProfile: { childrenPermille: 250, eldersPermille: 80, economicProductivityPermille: 750, culturalCohesionPermille: 640, developmentIndexPermille: 420 } },
        { id: 'east', name: 'East', preset: 'east' as const, radiusCells: 3, populationCount: 1 },
      ],
    }
    const engine = SimulationEngine.create(draft)
    const snapshot = await engine.snapshot()
    const cohort = snapshot.state.cohorts[0]!

    expect(snapshot.state.people).toHaveLength(2)
    expect(cohort).toMatchObject({ id: 'cohort:west', sourceZoneId: 'west', populationCount: 100_000, householdCount: Math.ceil(100_000 / 3), ageBands: { children: 25_000, elders: 8_000 }, economicProductivityPermille: 750, culturalCohesionPermille: 640, developmentIndexPermille: 420, eventTotals: { births: 0, deaths: 0, migrationIn: 0, migrationOut: 0 } })
    expect(cohort.cellAllocations.reduce((sum, allocation) => sum + allocation.populationCount, 0)).toBe(100_000)
    expect(cohort.ageBands.children + cohort.ageBands.adults + cohort.ageBands.elders).toBe(100_000)

    const source = engine.project()
    const projection = new WorkbenchProjectionBuilder(source).build(source, { revision: 1, bounds: { minQ: 0, maxQ: 31, minR: 0, maxR: 23 }, projectedHexRadius: 8, overlay: 'population' })
    expect(projection.summary.populationCount).toBe(100_002)
    expect(projection.map.exactCells.reduce((sum, cell) => sum + cell.populationCount, 0)).toBe(100_002)
    expect((await SimulationEngine.restore(snapshot)).project().cohorts).toEqual(source.cohorts)
  })
})
