import type { GeographicCell, HouseholdRelocationTrace, HouseholdState, PersonState, RelationshipState, SettlementState } from '../domain/types'
import { getPersonVariable } from '../variables/storage'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { findPathDetailed } from '../spatial/pathfinding'
import { hexDistance } from '../spatial/hex'
import { ROAD_MOVEMENT_COST_MULTIPLIER_PERMILLE } from '../agents/actionConfig'
import { settlementMigrationTrace } from '../settlements/regional'

/** Monthly, bounded home-choice pass. All values are integer permille or whole movement-cost units. */
export const HOUSEHOLD_RELOCATION = {
  intervalHours: 720,
  maximumDistance: 8,
  maximumCandidates: 24,
  maximumPathExpansions: 240,
  minimumUtility: 110,
  maximumProbabilityPermille: 700,
  /** Food units per current household member before stores stop adding relocation pressure. */
  foodReserveTargetUnitsPerMember: 4,
  maximumFoodReservePressurePermille: 220,
} as const

/** A named stream isolates relocation outcomes from life-cycle and action draws. */
export const HOUSEHOLD_RELOCATION_STREAM = 'household.relocation' as const

export interface HouseholdRelocationCandidate {
  readonly destinationCellId: string
  readonly foodAccessPermille: number
  readonly foodAccessDeltaPermille: number
  readonly foodReservePressurePermille: number
  readonly travelCost: number
  readonly householdTiePermille: number
  readonly crowdingDelta: number
  readonly riskCostPermille: number
  /** Bounded regional pull derived from actual employment, housing, safety, access, and services. */
  readonly settlementUtilityPermille: number
  readonly utilityPermille: number
}

export interface HouseholdRelocationEvaluation {
  readonly sourceCellId: string
  readonly candidate?: HouseholdRelocationCandidate
  readonly probabilityPermille: number
}

export interface HouseholdRelocationInput {
  readonly household: HouseholdState
  readonly peopleById: ReadonlyMap<string, PersonState>
  readonly households: readonly HouseholdState[]
  readonly relationships: readonly RelationshipState[]
  readonly cells: readonly GeographicCell[]
  readonly roadCellIds: ReadonlySet<string>
  readonly settlements?: readonly SettlementState[]
  readonly healthDisplacementPermille?: number
}

/**
 * Evaluates reachable homes; it never mutates state or draws randomness. The
 * engine resolves the returned probability with HOUSEHOLD_RELOCATION_STREAM.
 */
export function evaluateHouseholdRelocation(input: HouseholdRelocationInput): HouseholdRelocationEvaluation {
  const source = input.cells.find((cell) => cell.id === input.household.homeCellId)
  if (!source || source.movementCost <= 0) return { sourceCellId: input.household.homeCellId, probabilityPermille: 0 }
  const cellsById = new Map(input.cells.map((cell) => [cell.id, cell]))
  const householdPeople = input.household.memberIds
    .map((id) => input.peopleById.get(id))
    .filter((person): person is PersonState => person !== undefined)
  if (householdPeople.length === 0) return { sourceCellId: source.id, probabilityPermille: 0 }

  const sourceFood = localFoodAccess(source, input.cells)
  const sourceCrowding = householdCrowding(source.id, input.household.id, input.households)
  const averageHunger = Math.floor(householdPeople.reduce((sum, person) => sum + getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger), 0) / householdPeople.length)
  const averageRiskTolerance = Math.floor(householdPeople.reduce((sum, person) => sum + getPersonVariable(person.variables, PERSON_VARIABLE_ID.riskTolerance), 0) / householdPeople.length)
  const foodReservePressurePermille = foodReservePressure(input.household, householdPeople.length)
  const scarcityPressure = clamp(averageHunger + foodReservePressurePermille, 0, 1000)
  const candidateHomes = input.cells
    .filter((cell) => cell.id !== source.id && cell.movementCost > 0 && hexDistance(source, cell) <= HOUSEHOLD_RELOCATION.maximumDistance)
    .sort((first, second) => hexDistance(source, first) - hexDistance(source, second) || first.id.localeCompare(second.id))
    .slice(0, HOUSEHOLD_RELOCATION.maximumCandidates)
  const candidates: HouseholdRelocationCandidate[] = []
  for (const destination of candidateHomes) {
    const pathResult = findPathDetailed({ width: 0, height: 0, cells: [...input.cells] }, source.id, destination.id, {
      cellById: cellsById,
      maxExpansions: HOUSEHOLD_RELOCATION.maximumPathExpansions,
    })
    if (pathResult.truncated || !pathResult.path) continue
    const travelCost = pathResult.path.cellIds.slice(1).reduce((sum, cellId) => {
      const cell = cellsById.get(cellId)
      if (!cell) return sum
      const multiplier = input.roadCellIds.has(cell.id) ? ROAD_MOVEMENT_COST_MULTIPLIER_PERMILLE : 1000
      return sum + Math.floor(cell.movementCost * multiplier / 1000)
    }, 0)
    const foodAccessPermille = localFoodAccess(destination, input.cells)
    const foodAccessDeltaPermille = foodAccessPermille - sourceFood
    const destinationCrowding = householdCrowding(destination.id, input.household.id, input.households)
    const crowdingDelta = sourceCrowding - destinationCrowding
    const householdTiePermille = localHouseholdTies(destination, input.household, input.peopleById, input.households, input.relationships, cellsById)
    const travelCostPermille = Math.min(300, Math.floor(travelCost / 25))
    const riskCostPermille = Math.floor(travelCostPermille * (1000 - averageRiskTolerance) / 1000)
    const settlementFactors = settlementMigrationTrace(input.settlements ?? [], source.id, destination.id, householdTiePermille, foodAccessDeltaPermille, travelCost)
    const settlementUtilityPermille = Math.floor((settlementFactors.employmentPermille + settlementFactors.housingPermille + settlementFactors.safetyPermille + settlementFactors.infrastructurePermille + settlementFactors.servicesPermille) / 50) - 50 + Math.floor(settlementFactors.shockPermille / 20) + Math.floor(settlementFactors.geographyPermille / 50)
    const utilityPermille = Math.floor(foodAccessDeltaPermille * scarcityPressure / 1000)
      + Math.floor(householdTiePermille / 4)
      + crowdingDelta * 75
      + settlementUtilityPermille
      + (input.healthDisplacementPermille ?? 0)
      - travelCostPermille
      - riskCostPermille
    candidates.push({ destinationCellId: destination.id, foodAccessPermille, foodAccessDeltaPermille, foodReservePressurePermille, travelCost, householdTiePermille, crowdingDelta, riskCostPermille, settlementUtilityPermille, utilityPermille })
  }
  const candidate = candidates.sort((first, second) => second.utilityPermille - first.utilityPermille || first.destinationCellId.localeCompare(second.destinationCellId))[0]
  if (!candidate || candidate.utilityPermille < HOUSEHOLD_RELOCATION.minimumUtility) return { sourceCellId: source.id, probabilityPermille: 0 }
  return { sourceCellId: source.id, candidate, probabilityPermille: Math.min(HOUSEHOLD_RELOCATION.maximumProbabilityPermille, 150 + Math.floor(candidate.utilityPermille / 2)) }
}

export function relocationTrace(evaluation: HouseholdRelocationEvaluation, tick: number, randomRollPermille: number): HouseholdRelocationTrace | undefined {
  const candidate = evaluation.candidate
  if (!candidate || randomRollPermille >= evaluation.probabilityPermille) return undefined
  return {
    tick,
    sourceCellId: evaluation.sourceCellId,
    destinationCellId: candidate.destinationCellId,
    foodAccessDeltaPermille: candidate.foodAccessDeltaPermille,
    foodReservePressurePermille: candidate.foodReservePressurePermille,
    travelCost: candidate.travelCost,
    householdTiePermille: candidate.householdTiePermille,
    crowdingDelta: candidate.crowdingDelta,
    riskCostPermille: candidate.riskCostPermille,
    utilityPermille: candidate.utilityPermille,
    probabilityPermille: evaluation.probabilityPermille,
    randomRollPermille,
  }
}

/**
 * Material pressure is distinct from immediate hunger. Four units per member
 * is the current bounded reserve target; an empty store retains the former
 * +220 pressure while partial stores taper deterministically toward zero.
 */
function foodReservePressure(household: HouseholdState, memberCount: number): number {
  const targetPerHousehold = HOUSEHOLD_RELOCATION.foodReserveTargetUnitsPerMember * memberCount
  if (targetPerHousehold <= 0) return 0
  const storedFood = Math.max(0, household.inventory?.food ?? 0)
  const shortfall = Math.max(0, targetPerHousehold - storedFood)
  return clamp(Math.ceil(shortfall * HOUSEHOLD_RELOCATION.maximumFoodReservePressurePermille / targetPerHousehold), 0, HOUSEHOLD_RELOCATION.maximumFoodReservePressurePermille)
}

function localFoodAccess(center: GeographicCell, cells: readonly GeographicCell[]): number {
  const local = cells.filter((cell) => cell.movementCost > 0 && hexDistance(center, cell) <= 1)
  const capacity = local.reduce((sum, cell) => sum + cell.resourceCapacity, 0)
  return capacity === 0 ? 0 : clamp(Math.floor(local.reduce((sum, cell) => sum + cell.foodAmount, 0) * 1000 / capacity), 0, 1000)
}

function householdCrowding(cellId: string, excludedHouseholdId: string, households: readonly HouseholdState[]): number {
  return households.filter((household) => household.id !== excludedHouseholdId && household.homeCellId === cellId).reduce((sum, household) => sum + household.memberIds.length, 0)
}

function localHouseholdTies(destination: GeographicCell, household: HouseholdState, peopleById: ReadonlyMap<string, PersonState>, households: readonly HouseholdState[], relationships: readonly RelationshipState[], cellsById: ReadonlyMap<string, GeographicCell>): number {
  const householdIds = new Set(household.memberIds)
  const nearbyPeople = new Set(households
    .filter((candidate) => candidate.id !== household.id && hexDistance(destination, cellsById.get(candidate.homeCellId) ?? destination) <= 1)
    .flatMap((candidate) => candidate.memberIds))
  const ties = relationships
    .filter((relationship) => (householdIds.has(relationship.personAId) && nearbyPeople.has(relationship.personBId)) || (householdIds.has(relationship.personBId) && nearbyPeople.has(relationship.personAId)))
    .map((relationship) => relationship.familiarity)
  return ties.length === 0 ? 0 : Math.floor(ties.reduce((sum, tie) => sum + tie, 0) / ties.length)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
