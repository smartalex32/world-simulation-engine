import { describe, expect, it } from 'vitest'
import { buildProjectedSettlementLinks } from './regionalNetwork'

const cells = [{ id: '0,0', q: 0, r: 0, terrain: 'plain' as const, elevation: 0, habitability: 1000, movementCost: 1000, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0 }, { id: '1,0', q: 1, r: 0, terrain: 'plain' as const, elevation: 0, habitability: 1000, movementCost: 1000, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0 }]
describe('regional network projection', () => {
  it('derives stable road-adjusted links from real settlement routes', () => {
    const settlements = [{ id: 'a', name: 'A', anchorCellId: '0,0' }, { id: 'b', name: 'B', anchorCellId: '1,0' }]
    expect(buildProjectedSettlementLinks(settlements, cells, [{ id: 'road', cellIds: ['0,0', '1,0'] }])).toEqual([expect.objectContaining({ id: 'a|b', steps: 1, travelCost: 650, roadCellCount: 2 })])
  })
})
