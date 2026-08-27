import { describe, expect, it } from 'vitest'
import { buildProjectedSettlementServices } from './infrastructure'

describe('settlement infrastructure evidence', () => {
  it('counts only real markets, schools, and road cells inside the geographic catchment', () => {
    const cells = [
      { id: '0,0', q: 0, r: 0, terrain: 'plain' as const, elevation: 0, resourceCapacity: 1, foodAmount: 0, foodRegenerationPerDay: 0, habitability: 1, movementCost: 1 },
      { id: '1,0', q: 1, r: 0, terrain: 'plain' as const, elevation: 0, resourceCapacity: 1, foodAmount: 0, foodRegenerationPerDay: 0, habitability: 1, movementCost: 1 },
      { id: '2,0', q: 2, r: 0, terrain: 'plain' as const, elevation: 0, resourceCapacity: 1, foodAmount: 0, foodRegenerationPerDay: 0, habitability: 1, movementCost: 1 },
    ]
    const services = buildProjectedSettlementServices([{ id: 's', name: 'S', anchorCellId: '0,0', catchmentCellIds: ['0,0', '1,0'] }], cells, [{ id: 'market', cellId: '1,0', activityLocationId: 'activity.commons.1,0' }, { id: 'outside', cellId: '2,0', activityLocationId: 'activity.commons.2,0' }], [{ id: 'school', name: 'School', kind: 'school', locationCellId: '0,0', activityLocationId: 'activity.commons.0,0', members: [], serviceCapacity: 24, sharedRuleIds: [] }], [{ id: 'road', cellIds: ['1,0', '2,0'] }])
    expect(services).toEqual([{ settlementId: 's', marketCount: 1, schoolCount: 1, schoolCapacity: 24, roadCellCount: 1, infrastructureCapacity: 0, infrastructureConditionPermille: 0, disruptedAssetCount: 0 }])
  })
})
