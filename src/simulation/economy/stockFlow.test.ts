import { describe, expect, it } from 'vitest'
import { clearMarkets, createEconomyState, decayGoods, distributeMarketWages, initializeGoods, produceMonthlyGoods } from './stockFlow'

describe('preindustrial market clearing', () => {
  it('transfers explicit goods and currency with fixed-point price, transport, and tax traces', () => {
    const goods = [{ id: 'good.food', name: 'Food', category: 'food' as const, basePriceUnits: 2, decayPermillePerDay: 0 }]
    const market = { id: 'market', cellId: '1,0', activityLocationId: 'activity.commons.1,0' }
    const seller = { id: 'seller', homeCellId: '0,0', homeActivityLocationId: 'a', memberIds: ['s'], inventory: initializeGoods({ food: 20, tools: 0, currencyUnits: 0, goods: { 'good.food': 20, 'good.tool': 0, 'good.wood': 0 } }) }
    const buyer = { id: 'buyer', homeCellId: '2,0', homeActivityLocationId: 'b', memberIds: ['b'], inventory: initializeGoods({ food: 0, tools: 0, currencyUnits: 20, goods: { 'good.food': 0, 'good.tool': 0, 'good.wood': 0 } }) }
    const economy = createEconomyState([market], goods)
    const cells = new Map([['0,0', { id: '0,0', q: 0, r: 0 }], ['1,0', { id: '1,0', q: 1, r: 0 }], ['2,0', { id: '2,0', q: 2, r: 0 }]])
    const traces = clearMarkets({ economy, households: [seller, buyer], markets: [market], cellsById: cells as never, tick: 720 })
    expect(traces).toHaveLength(1)
    expect(traces[0]).toMatchObject({ sellerHouseholdId: 'seller', buyerHouseholdId: 'buyer', goodId: 'good.food', quantity: 1, taxUnits: 1 })
    expect(seller.inventory.goods?.['good.food']).toBe(19)
    expect(buyer.inventory.goods?.['good.food']).toBe(1)
    expect(buyer.inventory.currencyUnits).toBeLessThan(20)
  })

  it('does not overdraft a buyer when fixed-point tax is included in affordability', () => {
    const goods = [{ id: 'good.food', name: 'Food', category: 'food' as const, basePriceUnits: 2, decayPermillePerDay: 0 }]
    const market = { id: 'market', cellId: '0,0', activityLocationId: 'activity.commons.0,0' }
    const seller = { id: 'seller', homeCellId: '0,0', homeActivityLocationId: 'a', memberIds: ['s'], inventory: initializeGoods({ food: 20, tools: 0, currencyUnits: 0 }) }
    const buyer = { id: 'buyer', homeCellId: '0,0', homeActivityLocationId: 'b', memberIds: ['b'], inventory: initializeGoods({ food: 0, tools: 0, currencyUnits: 1 }) }
    const economy = createEconomyState([market], goods)
    expect(clearMarkets({ economy, households: [seller, buyer], markets: [market], cellsById: new Map([['0,0', { id: '0,0', q: 0, r: 0 }]]) as never, tick: 720 })).toEqual([])
    expect(buyer.inventory.currencyUnits).toBe(1)
  })

  it('conserves declared recipe inputs while creating only declared outputs', () => {
    const household = { id: 'craft', homeCellId: '0,0', homeActivityLocationId: 'a', memberIds: ['person'], inventory: initializeGoods({ food: 0, tools: 0, currencyUnits: 0, goods: { 'good.food': 0, 'good.tool': 0, 'good.wood': 2 } }) }
    const economy = createEconomyState([], [{ id: 'good.wood', name: 'Wood', category: 'material', basePriceUnits: 2, decayPermillePerDay: 0 }, { id: 'good.tool', name: 'Tool', category: 'tool', basePriceUnits: 4, decayPermillePerDay: 0 }])
    const traces = produceMonthlyGoods({ economy, households: [household], peopleById: new Map([['person', { occupation: 'household', lifeStatus: 'alive' }]]), recipes: [{ id: 'recipe.tool', inputs: { 'good.wood': 2 }, outputs: { 'good.tool': 1 }, laborHours: 8 }], tick: 720 })
    expect(traces).toMatchObject([{ recipeId: 'recipe.tool', inputs: { 'good.wood': 2 }, outputs: { 'good.tool': 1 } }])
    expect(household.inventory.goods).toMatchObject({ 'good.wood': 1, 'good.tool': 1 })
  })

  it('applies only pack-declared daily decay with fixed-point floor rounding', () => {
    const household = { id: 'h', homeCellId: '0,0', homeActivityLocationId: 'a', memberIds: [], inventory: initializeGoods({ food: 99, tools: 1, goods: { 'good.food': 99, 'good.tool': 1, 'good.wood': 0 } }) }
    expect(decayGoods([household], [{ id: 'good.food', name: 'Food', category: 'food', basePriceUnits: 1, decayPermillePerDay: 100 }, { id: 'good.tool', name: 'Tool', category: 'tool', basePriceUnits: 1, decayPermillePerDay: 0 }])).toBe(9)
    expect(household.inventory.goods?.['good.food']).toBe(90)
  })

  it('pays a bounded wage from collected market tax in canonical household order', () => {
    const market = { id: 'market', cellId: '0,0', activityLocationId: 'activity.commons.0,0' }
    const economy = createEconomyState([market], [])
    economy.markets[0]!.treasuryUnits = 1
    const household = { id: 'worker', homeCellId: '0,0', homeActivityLocationId: 'a', memberIds: ['person'], inventory: initializeGoods({ food: 0, tools: 0, currencyUnits: 0 }) }
    expect(distributeMarketWages({ economy, households: [household], peopleById: new Map([['person', { occupation: 'forager', lifeStatus: 'alive' }]]), tick: 720 })).toEqual([{ tick: 720, marketId: 'market', householdId: 'worker', wageUnits: 1, workerCount: 1 }])
    expect(household.inventory.currencyUnits).toBe(1)
    expect(economy.markets[0]!.treasuryUnits).toBe(0)
  })
})
