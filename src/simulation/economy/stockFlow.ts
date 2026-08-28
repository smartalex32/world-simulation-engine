import type { EconomyState, GeographicCell, HouseholdInventory, HouseholdState, MarketState } from '../domain/types'
import type { EconomyGoodDefinition } from '../../contentPacks/types'
import { hexDistance } from '../spatial/hex'

export const ECONOMY_TAX_PERMILLE = 50
export const MAX_ECONOMY_TRACES = 2_000

/** Creates deterministic market ledgers with pack-defined, integer price anchors. */
export function createEconomyState(markets: readonly MarketState[], goods: readonly EconomyGoodDefinition[]): EconomyState {
  const prices = Object.fromEntries([...goods].sort((a, b) => a.id.localeCompare(b.id)).map((good) => [good.id, good.basePriceUnits]))
  return { version: 1, markets: [...markets].sort((a, b) => a.id.localeCompare(b.id)).map((market) => ({ version: 1, marketId: market.id, prices: { ...prices }, treasuryUnits: 0, lastClearedTick: 0 })), tradeTraces: [], totalTaxCollectedUnits: 0 }
}

/** Keeps legacy food/tool fields explicit while adding a canonical sparse good ledger. */
export function initializeGoods(inventory: HouseholdInventory): HouseholdInventory {
  inventory.currencyUnits ??= 0
  inventory.goods ??= { 'good.food': inventory.food, 'good.tool': inventory.tools, 'good.wood': 0 }
  inventory.goods['good.food'] ??= inventory.food
  inventory.goods['good.tool'] ??= inventory.tools
  inventory.goods['good.wood'] ??= 0
  return inventory
}

export function synchronizeLegacyGoods(inventory: HouseholdInventory): void {
  initializeGoods(inventory)
  inventory.food = inventory.goods!['good.food'] ?? 0
  inventory.tools = inventory.goods!['good.tool'] ?? 0
}

/** Clears one bounded physical-market cycle. Buyers and sellers retain explicit
 * household ownership; prices, tax, and transport are integer-only. */
export function clearMarkets(input: { economy: EconomyState; households: HouseholdState[]; markets: readonly MarketState[]; cellsById: ReadonlyMap<string, GeographicCell>; tick: number }): EconomyState['tradeTraces'] {
  const households = [...input.households].filter((household) => household.inventory).sort((a, b) => a.id.localeCompare(b.id))
  const traces: EconomyState['tradeTraces'] = []
  for (const market of [...input.markets].sort((a, b) => a.id.localeCompare(b.id))) {
    const ledger = input.economy.markets.find((candidate) => candidate.marketId === market.id)
    const marketCell = input.cellsById.get(market.cellId)
    if (!ledger || !marketCell) continue
    for (const goodId of Object.keys(ledger.prices).sort()) {
      const sellers = households.filter((household) => (initializeGoods(household.inventory!).goods![goodId] ?? 0) > reserveFor(household, goodId))
      const buyers = households.filter((household) => (initializeGoods(household.inventory!).goods![goodId] ?? 0) < reserveFor(household, goodId) && (household.inventory!.currencyUnits ?? 0) > 0)
      const supply = sellers.reduce((total, household) => total + (household.inventory!.goods![goodId] ?? 0) - reserveFor(household, goodId), 0)
      const demand = buyers.reduce((total, household) => total + reserveFor(household, goodId) - (household.inventory!.goods![goodId] ?? 0), 0)
      ledger.prices[goodId] = adjustPrice(ledger.prices[goodId]!, supply, demand)
      for (const buyer of buyers) {
        const seller = sellers.find((candidate) => candidate.id !== buyer.id && (candidate.inventory!.goods![goodId] ?? 0) > reserveFor(candidate, goodId))
        if (!seller) break
        const price = ledger.prices[goodId]!
        const transportCostUnits = transportCost(input.cellsById.get(seller.homeCellId), input.cellsById.get(buyer.homeCellId), marketCell)
        const affordableQuantity = Math.floor((buyer.inventory!.currencyUnits ?? 0) / Math.max(1, price + transportCostUnits))
        const quantity = Math.min(1, affordableQuantity, (seller.inventory!.goods![goodId] ?? 0) - reserveFor(seller, goodId), reserveFor(buyer, goodId) - (buyer.inventory!.goods![goodId] ?? 0))
        if (quantity < 1) continue
        const taxUnits = Math.floor(price * quantity * ECONOMY_TAX_PERMILLE / 1000)
        const payment = price * quantity + transportCostUnits + taxUnits
        const sellerGoods = seller.inventory!.goods!
        const buyerGoods = buyer.inventory!.goods!
        sellerGoods[goodId] = (sellerGoods[goodId] ?? 0) - quantity
        buyerGoods[goodId] = (buyerGoods[goodId] ?? 0) + quantity
        buyer.inventory!.currencyUnits = (buyer.inventory!.currencyUnits ?? 0) - payment; seller.inventory!.currencyUnits = (seller.inventory!.currencyUnits ?? 0) + price * quantity
        synchronizeLegacyGoods(seller.inventory!); synchronizeLegacyGoods(buyer.inventory!)
        ledger.treasuryUnits += taxUnits; input.economy.totalTaxCollectedUnits += taxUnits
        traces.push({ tick: input.tick, marketId: market.id, goodId, sellerHouseholdId: seller.id, buyerHouseholdId: buyer.id, quantity, unitPriceUnits: price, transportCostUnits, taxUnits })
      }
    }
    ledger.lastClearedTick = input.tick
  }
  input.economy.tradeTraces = [...input.economy.tradeTraces, ...traces].slice(-MAX_ECONOMY_TRACES)
  return traces
}

function reserveFor(household: HouseholdState, goodId: string): number { return goodId === 'good.food' ? household.memberIds.length * 4 : goodId === 'good.tool' ? household.memberIds.length : 0 }
function adjustPrice(previous: number, supply: number, demand: number): number { return Math.max(1, previous + Math.trunc((demand - supply) * 100 / Math.max(1, supply + demand))) }
function transportCost(seller: GeographicCell | undefined, buyer: GeographicCell | undefined, market: GeographicCell): number { if (!seller || !buyer) return 0; return Math.max(0, hexDistance(seller, market) + hexDistance(buyer, market) - 2) }
