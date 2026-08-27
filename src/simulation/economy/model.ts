import type { GeographicCell, HouseholdInventory, HouseholdState, MarketState, PersonOccupation, RelationshipState, SettlementState } from '../domain/types'
import { commonsActivityId } from '../activities/model'
import { hexDistance } from '../spatial/hex'

/** Small, inspectable economy: food is harvested from a public cell into household ownership. */
export const ECONOMY = Object.freeze({
  initialFoodPerHouseholdMember: 12,
  foodPerWorkHour: 8,
  minimumFoodToShare: 24,
  targetFoodForRecipient: 12,
  maximumFoodPerExchange: 8,
  minimumFamiliarityToShare: 100,
  initialToolsPerMember: 1,
} as const)

export function occupationFor(ageYears: number, ordinal: number): PersonOccupation {
  if (ageYears < 16) return 'dependent'
  return ordinal % 3 === 0 ? 'household' : 'forager'
}

export function initialInventory(memberCount: number, ordinal = 1): HouseholdInventory {
  return { food: memberCount * ECONOMY.initialFoodPerHouseholdMember, tools: ordinal % 2 === 0 ? memberCount * 2 : 0 }
}

export function createInitialMarkets(cells: readonly GeographicCell[], settlements: readonly SettlementState[]): MarketState[] {
  const authoredTemplateSettlements = [...settlements].filter((settlement) => settlement.template !== undefined).sort((a, b) => a.id.localeCompare(b.id))
  if (authoredTemplateSettlements.length > 0) {
    return authoredTemplateSettlements.map((settlement, index) => {
      const cell = cells.find((candidate) => candidate.id === settlement.anchorCellId)
      if (!cell?.movementCost) throw new Error(`Settlement ${settlement.id} has no passable market anchor`)
      return { id: `market-${(index + 1).toString().padStart(4, '0')}`, cellId: cell.id, activityLocationId: commonsActivityId(cell.id) }
    })
  }
  const anchor = [...settlements].sort((a, b) => a.id.localeCompare(b.id)).map((settlement) => cells.find((cell) => cell.id === settlement.anchorCellId)).find((cell) => cell?.movementCost)
    ?? [...cells].filter((cell) => cell.movementCost > 0).sort((a, b) => Math.abs(a.q - 16) + Math.abs(a.r - 12) - (Math.abs(b.q - 16) + Math.abs(b.r - 12)) || a.id.localeCompare(b.id))[0]
  return anchor ? [{ id: 'market-0001', cellId: anchor.id, activityLocationId: commonsActivityId(anchor.id) }] : []
}

export interface ToolExchange { marketId: string; donorHouseholdId: string; recipientHouseholdId: string; amount: number }
/** Exact shared market presence is the only access condition in this first exchange slice. */
export function resolveToolExchanges(households: readonly HouseholdState[], markets: readonly MarketState[], occupantsByActivity: ReadonlyMap<string, readonly string[]>, peopleById: ReadonlyMap<string, { householdId: string }>, storageAccessPermilleByMarketId: ReadonlyMap<string, number> = new Map()): ToolExchange[] {
  const byId = new Map(households.map((household) => [household.id, household]))
  const exchanges: ToolExchange[] = []
  for (const market of [...markets].sort((a, b) => a.id.localeCompare(b.id))) {
    if ((storageAccessPermilleByMarketId.get(market.id) ?? 1000) === 0) continue
    const present = [...new Set((occupantsByActivity.get(market.activityLocationId) ?? []).map((personId) => peopleById.get(personId)?.householdId).filter((id): id is string => id !== undefined))]
      .map((id) => byId.get(id)).filter((household): household is HouseholdState => household !== undefined).sort((a, b) => a.id.localeCompare(b.id))
    const committed = new Set<string>()
    for (const recipient of present) {
      const need = recipient.memberIds.length - (recipient.inventory?.tools ?? 0)
      if (need <= 0 || committed.has(recipient.id) || !recipient.inventory) continue
      const donor = present.filter((candidate) => candidate.id !== recipient.id && !committed.has(candidate.id) && (candidate.inventory?.tools ?? 0) > candidate.memberIds.length)
        .sort((a, b) => ((b.inventory?.tools ?? 0) - b.memberIds.length) - ((a.inventory?.tools ?? 0) - a.memberIds.length) || a.id.localeCompare(b.id))[0]
      if (!donor?.inventory) continue
      const amount = Math.min(1, need, donor.inventory.tools - donor.memberIds.length)
      if (amount <= 0) continue
      donor.inventory.tools -= amount; recipient.inventory.tools += amount
      committed.add(donor.id); committed.add(recipient.id); exchanges.push({ marketId: market.id, donorHouseholdId: donor.id, recipientHouseholdId: recipient.id, amount })
    }
  }
  return exchanges
}

export function harvestFood(cell: GeographicCell, inventory: HouseholdInventory, efficiencyPermille = 1000): number {
  if (!Number.isSafeInteger(efficiencyPermille) || efficiencyPermille < 0) throw new RangeError('Harvest efficiency must be a non-negative safe integer')
  const amount = Math.min(Math.floor(ECONOMY.foodPerWorkHour * efficiencyPermille / 1000), cell.foodAmount)
  cell.foodAmount -= amount
  inventory.food += amount
  return amount
}

export function consumeHouseholdFood(inventory: HouseholdInventory, desired: number): number {
  const amount = Math.min(Math.max(0, desired), inventory.food)
  inventory.food -= amount
  return amount
}

export interface FoodShare { donorHouseholdId: string; recipientHouseholdId: string; amount: number }

/**
 * Deterministically identifies one daily share per eligible nearby household pair.
 * Relationship familiarity is evidence of access; no community membership is used.
 */
export function resolveFoodShares(
  households: readonly HouseholdState[],
  cellsById: ReadonlyMap<string, GeographicCell>,
  relationships: readonly RelationshipState[],
  peopleById: ReadonlyMap<string, { householdId: string }>,
): FoodShare[] {
  const familiarityByPair = new Map<string, number>()
  for (const relationship of relationships) {
    const first = peopleById.get(relationship.personAId)?.householdId
    const second = peopleById.get(relationship.personBId)?.householdId
    if (!first || !second || first === second) continue
    const key = pairKey(first, second)
    familiarityByPair.set(key, Math.max(familiarityByPair.get(key) ?? 0, relationship.familiarity))
  }
  const shares: FoodShare[] = []
  const committed = new Set<string>()
  const ordered = [...households].sort((a, b) => a.id.localeCompare(b.id))
  for (const recipient of ordered) {
    if ((recipient.inventory?.food ?? 0) >= ECONOMY.targetFoodForRecipient || committed.has(recipient.id)) continue
    const recipientCell = cellsById.get(recipient.homeCellId)
    if (!recipientCell) continue
    const donor = ordered
      .filter((candidate) => candidate.id !== recipient.id && !committed.has(candidate.id) && (candidate.inventory?.food ?? 0) >= ECONOMY.minimumFoodToShare)
      .filter((candidate) => {
        const cell = cellsById.get(candidate.homeCellId)
        return cell !== undefined && hexDistance(cell, recipientCell) <= 1 && (familiarityByPair.get(pairKey(candidate.id, recipient.id)) ?? 0) >= ECONOMY.minimumFamiliarityToShare
      })
      .sort((a, b) => (b.inventory?.food ?? 0) - (a.inventory?.food ?? 0) || a.id.localeCompare(b.id))[0]
    if (!donor) continue
    if (!donor.inventory || !recipient.inventory) continue
    const amount = Math.min(ECONOMY.maximumFoodPerExchange, donor.inventory.food - ECONOMY.targetFoodForRecipient, ECONOMY.targetFoodForRecipient - recipient.inventory.food)
    if (amount <= 0) continue
    donor.inventory.food -= amount
    recipient.inventory.food += amount
    committed.add(donor.id)
    committed.add(recipient.id)
    shares.push({ donorHouseholdId: donor.id, recipientHouseholdId: recipient.id, amount })
  }
  return shares
}

function pairKey(first: string, second: string): string { return first < second ? `${first}|${second}` : `${second}|${first}` }
