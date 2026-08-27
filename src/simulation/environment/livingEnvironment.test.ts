import { describe, expect, it } from 'vitest'
import type { GeographicCell, HexGrid } from '../domain/types'
import { deriveLivingEnvironment } from './livingEnvironment'

const cell = (id: string, q: number, elevation: number): GeographicCell => ({ id, q, r: 0, elevation, terrain: 'plain', habitability: 800, movementCost: 1000, resourceCapacity: 10, foodAmount: 10, foodRegenerationPerDay: 2 })

describe('living environment', () => {
  it('derives biome, agriculture, hazards, and actual human pressure deterministically', () => {
    const grid: HexGrid = { width: 3, height: 1, cells: [cell('0,0', 0, 300), cell('1,0', 1, 200), cell('2,0', 2, 100)] }
    const environment = deriveLivingEnvironment(grid, 0, new Map([['1,0', 8]]))
    expect(environment.get('1,0')).toMatchObject({ biomeId: 'temperate-grassland', agriculturalSuitabilityPermille: expect.any(Number), humanPressurePermille: 800 })
    expect(environment.get('1,0')!.hazardRiskPermille).toBeGreaterThan(0)
    expect(deriveLivingEnvironment(grid, 0, new Map([['1,0', 8]]))).toEqual(environment)
  })
})
