import { describe, expect, it } from 'vitest'
import type { GeographicCell, HexGrid } from '../domain/types'
import { findPath, findPathDetailed } from './pathfinding'

function cell(id: string, q: number, r: number, movementCost: number): GeographicCell {
  return { id, q, r, terrain: movementCost === 0 ? 'water' : movementCost > 1000 ? 'hill' : 'plain', elevation: 100, habitability: movementCost ? 500 : 0, movementCost, resourceCapacity: 10, foodAmount: 10, foodRegenerationPerDay: 1 }
}

describe('weighted hex pathfinding', () => {
  const grid: HexGrid = {
    width: 3,
    height: 2,
    cells: [
      cell('0,0', 0, 0, 1000), cell('1,0', 1, 0, 4000), cell('2,0', 2, 0, 1000),
      cell('0,1', 0, 1, 1000), cell('1,1', 1, 1, 1000), cell('2,1', 2, 1, 1000),
    ],
  }

  it('chooses a longer geometric route when its terrain cost is lower', () => {
    expect(findPath(grid, '0,0', '2,0')).toEqual({ cellIds: ['0,0', '0,1', '1,1', '2,0'], totalCost: 3000 })
  })

  it('returns no route to blocked terrain', () => {
    const blocked = structuredClone(grid)
    const goal = blocked.cells.find((entry) => entry.id === '2,0')
    if (goal) goal.movementCost = 0
    expect(findPath(blocked, '0,0', '2,0')).toBeUndefined()
  })

  it('reports a bounded search honestly when its expansion budget is exhausted', () => {
    expect(findPathDetailed(grid, '0,0', '2,0', { maxExpansions: 1 })).toEqual({ truncated: true, expansions: 1 })
  })
})
