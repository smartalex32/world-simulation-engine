import { describe, expect, it } from 'vitest'
import type { GeographicCell } from '../domain/types'
import { climateConditionsAt, climateZoneForCell, regeneratedFoodAmount } from './climate'
import { HOURS_PER_SEASON } from './season'

function cell(overrides: Partial<GeographicCell>): GeographicCell {
  return { id: '0,0', q: 0, r: 0, terrain: 'plain', elevation: 200, habitability: 900, movementCost: 1000, resourceCapacity: 100, foodAmount: 0, foodRegenerationPerDay: 10, ...overrides }
}

describe('seasonal climate conditions', () => {
  it('derives stable zones from authored terrain and elevation', () => {
    expect(climateZoneForCell(cell({ elevation: 200 }))).toBe('temperate')
    expect(climateZoneForCell(cell({ elevation: 500 }))).toBe('dry')
    expect(climateZoneForCell(cell({ terrain: 'hill', elevation: 700 }))).toBe('upland')
    expect(climateZoneForCell(cell({ terrain: 'water', resourceCapacity: 0 }))).toBe('water')
  })

  it('keeps climate output deterministic while producing meaningful seasonal differences', () => {
    const temperate = cell({ elevation: 200 })
    const dry = cell({ elevation: 500 })
    expect(climateConditionsAt(temperate, 0)).toEqual(climateConditionsAt(temperate, 0))
    expect(regeneratedFoodAmount(temperate, HOURS_PER_SEASON)).toBeGreaterThan(regeneratedFoodAmount(temperate, HOURS_PER_SEASON * 3))
    expect(regeneratedFoodAmount(temperate, 0)).toBeGreaterThan(regeneratedFoodAmount(dry, 0))
    expect(climateConditionsAt(temperate, HOURS_PER_SEASON).agriculturalProductivityPermille).toBeGreaterThan(
      climateConditionsAt(temperate, HOURS_PER_SEASON * 3).agriculturalProductivityPermille,
    )
  })
})
