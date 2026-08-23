import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../simulation/engine/engine'
import { buildProjectedSettlements, SETTLEMENT_PROFILE_RADIUS_CELLS, settlementScaleForResidents } from './settlements'

describe('settlement presentation profiles', () => {
  it('classifies nearby homes without assigning people settlement membership', () => {
    const source = SimulationEngine.create('settlement-profile').project()
    const anchor = source.world.grid.cells.find((cell) => cell.movementCost > 0)
    if (!anchor) throw new Error('Expected a passable anchor')
    source.world.settlements = [{ id: 'anchor', name: 'Anchor', anchorCellId: anchor.id }]
    source.people = source.people.slice(0, 25).map((person) => ({ ...person, homeCellId: anchor.id }))

    const profiles = buildProjectedSettlements(source.world.settlements, source.world.grid.cells, source.people)

    expect(profiles).toEqual([{ id: 'anchor', name: 'Anchor', anchorCellId: anchor.id, scale: 'village', nearbyResidentCount: 25, nearbyHomeCellCount: 1 }])
    expect(SETTLEMENT_PROFILE_RADIUS_CELLS).toBe(4)
  })

  it('uses explicit, stable scale thresholds', () => {
    expect(settlementScaleForResidents(0)).toBe('landmark')
    expect(settlementScaleForResidents(1)).toBe('hamlet')
    expect(settlementScaleForResidents(24)).toBe('hamlet')
    expect(settlementScaleForResidents(25)).toBe('village')
    expect(settlementScaleForResidents(100)).toBe('town')
    expect(settlementScaleForResidents(300)).toBe('city')
  })
})
