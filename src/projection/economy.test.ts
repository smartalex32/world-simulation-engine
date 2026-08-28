import { describe, expect, it } from 'vitest'
import { buildProjectedEconomicSummary } from './economy'
import type { HouseholdState, PersonState } from '../simulation/domain/types'

function household(id: string, food: number, tools: number): HouseholdState {
  return { id, homeCellId: '0,0', homeActivityLocationId: 'activity.home.0,0', memberIds: [], inventory: { food, tools } } as HouseholdState
}
function person(id: string, occupation: PersonState['occupation'], lifeStatus: PersonState['lifeStatus'] = 'alive'): PersonState {
  return { id, occupation, lifeStatus } as PersonState
}

describe('buildProjectedEconomicSummary', () => {
  it('keeps distinct household materials and living labor roles inspectable', () => {
    expect(buildProjectedEconomicSummary(
      [household('h-2', 20, 0), household('h-1', 0, 8)],
      [person('p-1', 'forager'), person('p-2', 'household'), person('p-3', 'dependent'), person('p-4', undefined), person('p-5', 'forager', 'dead')],
    )).toEqual({
      householdCount: 2, householdsWithoutFoodCount: 1, foodUnits: 20, toolUnits: 8,
      foodGiniPermille: 500, toolGiniPermille: 500,
      currencyUnits: 0, currencyGiniPermille: 0, goodsById: {}, marketPrices: [], totalTaxCollectedUnits: 0, retainedTradeCount: 0, retainedProductionCount: 0,
      occupationCounts: { forager: 1, household: 1, dependent: 1, unassigned: 1 },
    })
  })

  it('reports no inequality when every household has the same material amount or none exist', () => {
    expect(buildProjectedEconomicSummary([household('a', 4, 1), household('b', 4, 1)], []).foodGiniPermille).toBe(0)
    expect(buildProjectedEconomicSummary([], []).toolGiniPermille).toBe(0)
  })
})
