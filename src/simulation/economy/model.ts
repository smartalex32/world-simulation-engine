import type { GeographicCell, HouseholdInventory, HouseholdState, PersonOccupation, RelationshipState } from '../domain/types'
import { hexDistance } from '../spatial/hex'

/** Small, inspectable economy: food is harvested from a public cell into household ownership. */
export const ECONOMY = Object.freeze({
  initialFoodPerHouseholdMember: 12,
  foodPerWorkHour: 8,
  minimumFoodToShare: 24,
  targetFoodForRecipient: 12,
  maximumFoodPerExchange: 8,
  minimumFamiliarityToShare: 100,
} as const)

export function occupationFor(ageYears: number, ordinal: number): PersonOccupation {
  if (ageYears < 16) return 'dependent'
  return ordinal % 3 === 0 ? 'household' : 'forager'
}

export function initialInventory(memberCount: number): HouseholdInventory {
  return { food: memberCount * ECONOMY.initialFoodPerHouseholdMember }
}

export function harvestFood(cell: GeographicCell, inventory: HouseholdInventory): number {
  const amount = Math.min(ECONOMY.foodPerWorkHour, cell.foodAmount)
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
