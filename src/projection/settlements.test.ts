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

    expect(profiles).toEqual([{ id: 'anchor', name: 'Anchor', anchorCellId: anchor.id, scale: 'village', nearbyResidentCount: 25, nearbyHomeCellCount: 1, nearbyHouseholdCount: 0, householdFoodStoreUnits: 0, recordedRelocationArrivalCount: 0, catchmentCellCount: expect.any(Number), catchmentSource: 'anchor-radius', currentVisitorCount: 0, catchmentResourceCapacity: expect.any(Number), waterAccessCellCount: expect.any(Number) }])
    expect(SETTLEMENT_PROFILE_RADIUS_CELLS).toBe(4)
  })

  it('uses an authored catchment rather than the fallback radius', () => {
    const source = SimulationEngine.create('authored-settlement-catchment').project()
    const [anchor, other] = source.world.grid.cells.filter((cell) => cell.movementCost > 0)
    if (!anchor || !other) throw new Error('Expected passable cells')
    source.world.settlements = [{ id: 'anchor', name: 'Anchor', anchorCellId: anchor.id, catchmentCellIds: [anchor.id] }]
    source.people = source.people.slice(0, 2).map((person, index) => ({ ...person, homeCellId: index === 0 ? anchor.id : other.id, locationCellId: anchor.id }))
    expect(buildProjectedSettlements(source.world.settlements, source.world.grid.cells, source.people)[0]).toMatchObject({ catchmentSource: 'authored', catchmentCellCount: 1, nearbyResidentCount: 1, currentVisitorCount: 1 })
  })

  it('summarizes household-owned food and retained relocation arrivals by catchment', () => {
    const source = SimulationEngine.create('settlement-material-evidence').project()
    const anchor = source.world.grid.cells.find((cell) => cell.movementCost > 0)
    const household = source.households[0]
    if (!anchor || !household) throw new Error('Expected a passable anchor and household')
    source.world.settlements = [{ id: 'anchor', name: 'Anchor', anchorCellId: anchor.id, catchmentCellIds: [anchor.id] }]
    household.homeCellId = anchor.id
    household.inventory = { food: 17, tools: 0 }
    household.lastRelocation = { tick: 720, sourceCellId: 'elsewhere', destinationCellId: anchor.id, foodAccessDeltaPermille: 500, foodReservePressurePermille: 110, travelCost: 1, householdTiePermille: 0, crowdingDelta: 0, riskCostPermille: 0, utilityPermille: 200, probabilityPermille: 250, randomRollPermille: 0 }

    expect(buildProjectedSettlements(source.world.settlements, source.world.grid.cells, source.people, source.households)[0]).toMatchObject({ nearbyHouseholdCount: 1, householdFoodStoreUnits: 17, recordedRelocationArrivalCount: 1 })
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
