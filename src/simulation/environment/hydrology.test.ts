import { describe, expect, it } from 'vitest'
import { deriveDrainage } from './hydrology'
import type { GeographicCell, HexGrid } from '../domain/types'

const cell = (id: string, q: number, r: number, elevation: number): GeographicCell => ({ id, q, r, elevation, terrain: 'plain', habitability: 800, movementCost: 1000, resourceCapacity: 100, foodAmount: 100, foodRegenerationPerDay: 8 })

describe('derived drainage', () => {
  it('flows only downhill and uses a binary-stable tie-breaker', () => {
    const grid: HexGrid = { width: 3, height: 1, cells: [cell('0,0', 0, 0, 100), cell('1,0', 1, 0, 50), cell('2,0', 2, 0, 50)] }
    const drainage = deriveDrainage(grid)
    expect(drainage.get('0,0')).toEqual({ cellId: '0,0', downstreamCellId: '1,0', basinId: '1,0' })
    expect(drainage.get('2,0')).toEqual({ cellId: '2,0', basinId: '2,0' })
  })
})
