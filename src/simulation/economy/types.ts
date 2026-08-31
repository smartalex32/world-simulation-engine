import type { ActivityLocationId } from '../households/types'

export interface HouseholdInventory { food: number; tools: number; currencyUnits?: number; goods?: Record<string, number> }
export interface EconomyMarketState { version: 1; marketId: string; prices: Record<string, number>; treasuryUnits: number; lastClearedTick: number }
export interface EconomyTradeTrace { tick: number; marketId: string; goodId: string; sellerHouseholdId: string; buyerHouseholdId: string; quantity: number; unitPriceUnits: number; transportCostUnits: number; taxUnits: number }
export interface EconomyProductionTrace { tick: number; householdId: string; recipeId: string; inputs: Record<string, number>; outputs: Record<string, number>; laborHours: number }
export interface EconomyWageTrace { tick: number; marketId: string; householdId: string; wageUnits: number; workerCount: number }
export interface EconomyState { version: 1; markets: EconomyMarketState[]; tradeTraces: EconomyTradeTrace[]; productionTraces: EconomyProductionTrace[]; wageTraces: EconomyWageTrace[]; totalTaxCollectedUnits: number }
/** A market is a bounded exchange designation attached to an existing commons location. */
export interface MarketState { id: string; cellId: string; activityLocationId: ActivityLocationId }
/** The last successful geographic home change, retained for inspection rather than inference. */
