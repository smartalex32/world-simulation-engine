import { describe, expect, it } from 'vitest'
import type { SettlementState } from '../domain/types'
import { migrateCohortsBetweenSettlements, reconcileSettlementRegions } from './regional'

const cells = [
  { id: '0,0', q: 0, r: 0, terrain: 'plain' as const, elevation: 0, habitability: 900, movementCost: 1000, resourceCapacity: 30, foodAmount: 10, foodRegenerationPerDay: 2 },
  { id: '1,0', q: 1, r: 0, terrain: 'plain' as const, elevation: 0, habitability: 900, movementCost: 1000, resourceCapacity: 20, foodAmount: 10, foodRegenerationPerDay: 2 },
]

describe('authoritative settlement regions', () => {
  it('retains explicit extent, household membership, services, materials, and lifecycle evidence', () => {
    const settlements: SettlementState[] = [{ id: 'settlement', name: 'Settlement', anchorCellId: '0,0', catchmentCellIds: ['0,0', '1,0'], scale: 'village' }]
    const households = [{ id: 'household-a', homeCellId: '0,0', homeActivityLocationId: 'activity.home.household-a', memberIds: ['person-a'], inventory: { food: 12, tools: 3 } }]
    const first = reconcileSettlementRegions({ settlements, cells, households, markets: [{ id: 'market', cellId: '0,0', activityLocationId: 'activity.commons.0,0' }], organizations: [{ id: 'school', name: 'School', kind: 'school' as const, locationCellId: '1,0', activityLocationId: 'activity.commons.1,0', members: [], serviceCapacity: 10, sharedRuleIds: [] }], roads: [{ cellIds: ['0,0', '1,0'] }], tick: 1 })
    expect(first).toMatchObject([{ settlementId: 'settlement', nextStatus: 'active', kind: 'formed' }])
    expect(settlements[0]?.regional).toMatchObject({ status: 'active', residentHouseholdIds: ['household-a'], marketIds: ['market'], organizationIds: ['school'], capacity: { housing: 6, food: 50, services: 10, materials: 50 }, materials: { food: 12, tools: 3 }, accessPermille: 1000 })
    const second = reconcileSettlementRegions({ settlements, cells, households: [], markets: [], organizations: [], roads: [], tick: 2 })
    expect(second).toMatchObject([{ nextStatus: 'abandoned', kind: 'abandoned', reason: 'no detailed or cohort residents' }])
  })

  it('retains urbanization, abandonment, and resettlement as distinct lifecycle transitions', () => {
    const settlements: SettlementState[] = [{ id: 'settlement', name: 'Settlement', anchorCellId: '0,0', catchmentCellIds: ['0,0', '1,0'], scale: 'village' }]
    const households = [{ id: 'household-a', homeCellId: '0,0', homeActivityLocationId: 'activity.home.household-a', memberIds: ['person-a'], inventory: { food: 12, tools: 3 } }]
    const context = { settlements, cells, households, markets: [], organizations: [], roads: [] }
    reconcileSettlementRegions({ ...context, tick: 1 })
    settlements[0]!.scale = 'town'
    expect(reconcileSettlementRegions({ ...context, tick: 2 })).toMatchObject([{ kind: 'urbanized', nextStatus: 'active' }])
    expect(reconcileSettlementRegions({ ...context, households: [], tick: 3 })).toMatchObject([{ kind: 'abandoned', nextStatus: 'abandoned' }])
    expect(reconcileSettlementRegions({ ...context, tick: 4 })).toMatchObject([{ kind: 'resettled', nextStatus: 'active' }])
  })

  it('moves a bounded cohort allocation from an abandoned settlement to viable housing without changing its total', () => {
    const settlements: SettlementState[] = [
      { id: 'source', name: 'Source', anchorCellId: '0,0', regional: { version: 1, status: 'abandoned', extentCellIds: ['0,0'], residentHouseholdIds: [], detailedResidentPopulationCount: 0, cohortResidentPopulationCount: 0, marketIds: [], organizationIds: [], accessPermille: 0, capacity: { housing: 0, food: 0, services: 0, materials: 0 }, materials: { food: 0, tools: 0 } } },
      { id: 'destination', name: 'Destination', anchorCellId: '1,0', regional: { version: 1, status: 'active', extentCellIds: ['1,0'], residentHouseholdIds: [], detailedResidentPopulationCount: 0, cohortResidentPopulationCount: 0, marketIds: [], organizationIds: [], accessPermille: 1000, capacity: { housing: 100, food: 100, services: 10, materials: 100 }, materials: { food: 0, tools: 0 } } },
    ]
    const cohorts = [{ version: 3 as const, id: 'cohort:source', sourceZoneId: 'source', populationCount: 100, householdCount: 34, foodUnits: 1, cellAllocations: [{ cellId: '0,0', populationCount: 100 }], ageBands: { children: 20, adults: 70, elders: 10 }, economicProductivityPermille: 500, culturalCohesionPermille: 500, developmentIndexPermille: 500, eventTotals: { births: 0, deaths: 0, migrationIn: 0, migrationOut: 0 } }]
    const traces = migrateCohortsBetweenSettlements(cohorts, settlements, cells, 720)
    expect(traces).toMatchObject([{ sourceSettlementId: 'source', destinationSettlementId: 'destination', populationCount: 5 }])
    expect(cohorts[0]?.cellAllocations).toEqual([{ cellId: '0,0', populationCount: 95 }, { cellId: '1,0', populationCount: 5 }])
    expect(cohorts[0]?.eventTotals).toMatchObject({ migrationIn: 5, migrationOut: 5 })
  })
})
