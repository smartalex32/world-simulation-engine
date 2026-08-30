import type { SimulationState } from '../domain/types'
import { failCanonicalValidation as fail } from '../validation/error'

/** Canonical validation owned by the market subsystem. */
export function validateMarketState(state: SimulationState): void {
  const ids = new Set(state.markets.map((market) => market.id))
  if (ids.size !== state.markets.length || state.markets.some((market, index) => index > 0 && state.markets[index - 1]!.id >= market.id)) fail('markets', 'state.markets', 'identity-or-ordering', 'Markets are not uniquely canonically ordered')
  const cellsById = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
  const locationsById = new Map(state.activityLocations.map((location) => [location.id, location]))
  for (const market of state.markets) if (!cellsById.get(market.cellId)?.movementCost || locationsById.get(market.activityLocationId)?.cellId !== market.cellId) fail('markets', `state.markets.${market.id}`, 'missing-reference', `Market ${market.id} has an invalid location`)
}

/** Canonical validation owned by the economy subsystem. */
export function validateEconomyState(state: SimulationState): void {
  const economy = state.economy
  if (!economy || economy.version !== 1 || !Array.isArray(economy.markets) || !Array.isArray(economy.tradeTraces) || !Array.isArray(economy.productionTraces) || !Array.isArray(economy.wageTraces) || !Number.isSafeInteger(economy.totalTaxCollectedUnits) || economy.totalTaxCollectedUnits < 0) throw new Error('Simulation contains invalid economy state')
  const marketIds = state.markets.map((market) => market.id)
  const householdIds = new Set(state.households.map((household) => household.id))
  if (!sameStrings(economy.markets.map((market) => market.marketId), marketIds)) throw new Error('Simulation economy markets do not match canonical markets')
  if (economy.markets.some((market) => market.version !== 1 || !market.marketId || !Number.isSafeInteger(market.treasuryUnits) || market.treasuryUnits < 0 || !Number.isSafeInteger(market.lastClearedTick) || Object.values(market.prices).some((price) => !Number.isSafeInteger(price) || price < 1))) throw new Error('Simulation contains invalid economy market ledger')
  if (economy.tradeTraces.some((trace) => !marketIds.includes(trace.marketId) || !householdIds.has(trace.sellerHouseholdId) || !householdIds.has(trace.buyerHouseholdId) || trace.tick > state.tick || trace.quantity < 1 || trace.unitPriceUnits < 1 || trace.transportCostUnits < 0 || trace.taxUnits < 0)) throw new Error('Simulation contains invalid economy trade trace')
  if (economy.productionTraces.some((trace) => !householdIds.has(trace.householdId) || trace.tick > state.tick || !trace.recipeId || !Number.isSafeInteger(trace.laborHours) || trace.laborHours < 0 || [...Object.values(trace.inputs), ...Object.values(trace.outputs)].some((value) => !Number.isSafeInteger(value) || value < 0))) throw new Error('Simulation contains invalid economy production trace')
  if (economy.wageTraces.some((trace) => !marketIds.includes(trace.marketId) || !householdIds.has(trace.householdId) || trace.tick > state.tick || !Number.isSafeInteger(trace.wageUnits) || trace.wageUnits < 1 || !Number.isSafeInteger(trace.workerCount) || trace.workerCount < 1)) throw new Error('Simulation contains invalid economy wage trace')
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
