import type { EconomyState, HouseholdInventory, MarketState } from '../domain/types'
import type { EconomyGoodDefinition } from '../../contentPacks/types'

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
