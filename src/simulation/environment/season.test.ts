import { describe, expect, it } from 'vitest'
import { HOURS_PER_SEASON, seasonAtTick, seasonalAmount } from './season'
import { SimulationEngine } from '../engine/engine'

describe('seasonal environment', () => {
  it('cycles deterministically from the simulation clock without RNG', () => {
    expect(seasonAtTick(0).id).toBe('spring')
    expect(seasonAtTick(HOURS_PER_SEASON).id).toBe('summer')
    expect(seasonAtTick(HOURS_PER_SEASON * 3).id).toBe('winter')
    expect(seasonAtTick(HOURS_PER_SEASON * 4).id).toBe('spring')
  })

  it('uses explicit floor rounding for integer resource amounts', () => {
    expect(seasonalAmount(11, 500)).toBe(5)
    expect(seasonalAmount(11, 1200)).toBe(13)
  })

  it('records exposure from the cell each person actually occupies', async () => {
    const engine = SimulationEngine.create('environment-exposure')
    engine.step()
    const state = (await engine.snapshot()).state
    const cells = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
    for (const person of state.people) {
      const exposure = person.environmentalExposure
      const cell = cells.get(person.locationCellId)
      expect(exposure).toEqual({
        observedHours: 1,
        foodAccessibleHours: cell && cell.foodAmount > 0 ? 1 : 0,
        difficultTerrainHours: cell && cell.movementCost > 1000 ? 1 : 0,
        thermalLoadPermilleHours: 450,
        waterAvailabilityPermilleHours: cell?.terrain === 'water' ? 1100 : cell?.terrain === 'hill' ? 682 : cell && cell.elevation >= 460 ? 473 : 935,
      })
    }
  })
})
