import { describe, expect, it } from 'vitest'
import { ECONOMY, consumeHouseholdFood, harvestFood, initialInventory, occupationFor, resolveFoodShares } from './model'

describe('economy model', () => {
  it('assigns only adults productive roles and transfers public food into household ownership', () => {
    expect(occupationFor(12, 1)).toBe('dependent')
    expect(occupationFor(25, 1)).toBe('forager')
    const cell = { id: '0,0', q: 0, r: 0, terrain: 'plain' as const, elevation: 0, habitability: 1000, movementCost: 1000, resourceCapacity: 20, foodAmount: 6, foodRegenerationPerDay: 1 }
    const inventory = initialInventory(1)
    expect(harvestFood(cell, inventory)).toBe(6)
    expect(cell.foodAmount).toBe(0)
    expect(consumeHouseholdFood(inventory, 4)).toBe(4)
    expect(inventory.food).toBe(ECONOMY.initialFoodPerHouseholdMember + 2)
  })

  it('shares only across nearby household relationships with demonstrated familiarity', () => {
    const households = [
      { id: 'household-1', homeCellId: '0,0', homeActivityLocationId: 'a', memberIds: ['p1'], inventory: { food: 30 } },
      { id: 'household-2', homeCellId: '1,0', homeActivityLocationId: 'b', memberIds: ['p2'], inventory: { food: 0 } },
    ]
    const cells = new Map([['0,0', { id: '0,0', q: 0, r: 0 }], ['1,0', { id: '1,0', q: 1, r: 0 }]])
    const people = new Map([['p1', { householdId: 'household-1' }], ['p2', { householdId: 'household-2' }]])
    const relationships = [{ id: 'p1|p2', personAId: 'p1', personBId: 'p2', familiarity: 300 }]
    expect(resolveFoodShares(households, cells as never, relationships as never, people)).toEqual([{ donorHouseholdId: 'household-1', recipientHouseholdId: 'household-2', amount: 8 }])
  })
})
