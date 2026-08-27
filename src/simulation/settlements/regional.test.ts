import { describe, expect, it } from 'vitest'
import type { SettlementState } from '../domain/types'
import { reconcileSettlementRegions } from './regional'

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
    expect(second).toMatchObject([{ nextStatus: 'abandoned', kind: 'abandoned', reason: 'no resident households' }])
  })
})
