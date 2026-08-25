import { describe, expect, it } from 'vitest'
import type { PersonState, SettlementState } from '../domain/types'
import { evaluateSettlementScale, initializeSettlementScales, updateSettlementScales } from './growth'
describe('settlement scale evidence', () => {
  it('requires viable resources and access for growth, and applies decline hysteresis', () => {
    expect(evaluateSettlementScale({ currentScale: 'village', population: 120, homeCellCount: 10, resourceCapacity: 500, waterAccessCellCount: 5 })).toMatchObject({ suggestedScale: 'town', direction: 'growth-ready' })
    expect(evaluateSettlementScale({ currentScale: 'town', population: 90, homeCellCount: 10, resourceCapacity: 500, waterAccessCellCount: 5 })).toMatchObject({ suggestedScale: 'town', direction: 'stable' })
    expect(evaluateSettlementScale({ currentScale: 'town', population: 70, homeCellCount: 10, resourceCapacity: 500, waterAccessCellCount: 5 })).toMatchObject({ suggestedScale: 'village', direction: 'decline-ready' })
  })

  it('retains an achieved scale until the lower hysteresis threshold is crossed', () => {
    const cells = [
      { id: '0,0', q: 0, r: 0, terrain: 'plain' as const, elevation: 0, resourceCapacity: 300, foodAmount: 0, foodRegenerationPerDay: 0, habitability: 1, movementCost: 1 },
      { id: '1,0', q: 1, r: 0, terrain: 'water' as const, elevation: 0, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0, habitability: 0, movementCost: 0 },
    ]
    const settlement = { id: 'settlement', name: 'Settlement', anchorCellId: '0,0', catchmentCellIds: ['0,0'], scale: 'town' as const }
    const people = Array.from({ length: 90 }, (_, index) => ({ id: `person-${index}`, homeCellId: '0,0', lifeStatus: 'alive' as const })) as Pick<PersonState, 'id' | 'homeCellId' | 'lifeStatus'>[] as PersonState[]
    expect(updateSettlementScales({ settlements: [settlement], cells, people })).toEqual([])
    expect(settlement.scale).toBe('town')
    const fewerPeople = people.slice(0, 70)
    expect(updateSettlementScales({ settlements: [settlement], cells, people: fewerPeople })).toMatchObject([{ previousScale: 'town', nextScale: 'village' }])
  })

  it('uses observed population as the initial authored scale before scheduled viability evaluation', () => {
    const cells = [{ id: '0,0', q: 0, r: 0, terrain: 'plain' as const, elevation: 0, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0, habitability: 1, movementCost: 1 }]
    const settlement: SettlementState = { id: 'settlement', name: 'Settlement', anchorCellId: '0,0' }
    const people = Array.from({ length: 100 }, (_, index) => ({ id: `person-${index}`, homeCellId: '0,0', lifeStatus: 'alive' as const })) as Pick<PersonState, 'id' | 'homeCellId' | 'lifeStatus'>[] as PersonState[]
    initializeSettlementScales({ settlements: [settlement], cells, people })
    expect(settlement.scale).toBe('town')
  })
})
