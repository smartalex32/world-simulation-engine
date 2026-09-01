import type { GeographicCell, HouseholdRelocationTrace, HouseholdState, PersonState, RelationshipState, SettlementState } from '../domain/types'
import { getPersonVariable } from '../variables/storage'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { findPathDetailed } from '../spatial/pathfinding'
import { hexDistance } from '../spatial/hex'
import { compareStableText } from '../../shared/stableOrder'
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
  readonly index?: HouseholdRelocationIndex
  readonly diagnostics?: { pathExpansions: number }
}

/** Reused for one monthly pass. It contains only derived, non-authoritative data. */
export interface HouseholdRelocationIndex {
  readonly cellsById: ReadonlyMap<string, GeographicCell>
  readonly settlementByCellId: ReadonlyMap<string, SettlementState>
  candidates(source: GeographicCell): readonly GeographicCell[]
  foodAccess(cell: GeographicCell): number
  crowding(cellId: string, excludedHouseholdId: string): number
  householdTies(destination: GeographicCell, household: HouseholdState): number
  moveHousehold(household: HouseholdState, sourceCellId: string, destinationCellId: string): void
}

export function buildHouseholdRelocationIndex(
  cells: readonly GeographicCell[],
  households: readonly HouseholdState[] = [],
  relationships: readonly RelationshipState[] = [],
  settlements: readonly SettlementState[] = [],
): HouseholdRelocationIndex {
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]))
  const cellsByCoordinate = new Map(cells.map((cell) => [`${cell.q},${cell.r}`, cell]))
  const householdsByHomeCellId = new Map<string, HouseholdState[]>()
  for (const household of households) addHousehold(householdsByHomeCellId, household.homeCellId, household)
  const relationshipsByPersonId = new Map<string, RelationshipState[]>()
  for (const relationship of relationships) {
    addRelationship(relationshipsByPersonId, relationship.personAId, relationship)
    addRelationship(relationshipsByPersonId, relationship.personBId, relationship)
  }
  const settlementByCellId = new Map<string, SettlementState>()
  for (const settlement of [...settlements].sort((first, second) => compareStableText(first.id, second.id))) {
    for (const cellId of settlement.regional?.extentCellIds ?? []) {
      if (!settlementByCellId.has(cellId)) settlementByCellId.set(cellId, settlement)
    }
  }
  const candidatesBySource = new Map<string, readonly GeographicCell[]>()
  const nearbyCellsByCellId = new Map<string, readonly GeographicCell[]>()
  const foodByCell = new Map<string, number>()
  return {
    cellsById,
    settlementByCellId,
    candidates(source) {
      let candidates = candidatesBySource.get(source.id)
      if (!candidates) {
        candidates = axialNeighborhood(source, HOUSEHOLD_RELOCATION.maximumDistance, cellsByCoordinate)
          .filter((cell) => cell.id !== source.id && cell.movementCost > 0)
          .sort((first, second) => hexDistance(source, first) - hexDistance(source, second) || compareStableText(first.id, second.id))
          .slice(0, HOUSEHOLD_RELOCATION.maximumCandidates)
        candidatesBySource.set(source.id, candidates)
      }
      return candidates
    },
    foodAccess(cell) {
      let value = foodByCell.get(cell.id)
      if (value === undefined) {
        let local = nearbyCellsByCellId.get(cell.id)
        if (!local) {
          local = axialNeighborhood(cell, 1, cellsByCoordinate).filter((candidate) => candidate.movementCost > 0)
          nearbyCellsByCellId.set(cell.id, local)
        }
        value = localFoodAccess(local)
        foodByCell.set(cell.id, value)
      }
      return value
    },
    crowding(cellId, excludedHouseholdId) {
      return (householdsByHomeCellId.get(cellId) ?? [])
        .filter((household) => household.id !== excludedHouseholdId)
        .reduce((sum, household) => sum + household.memberIds.length, 0)
    },
    householdTies(destination, household) {
      const householdMemberIds = new Set(household.memberIds)
      const nearbyPeople = new Set(axialNeighborhood(destination, 1, cellsByCoordinate)
        .flatMap((cell) => householdsByHomeCellId.get(cell.id) ?? [])
        .filter((candidate) => candidate.id !== household.id)
        .flatMap((candidate) => candidate.memberIds))
      const seenRelationships = new Set<string>()
      const ties: number[] = []
      for (const personId of household.memberIds) {
        for (const relationship of relationshipsByPersonId.get(personId) ?? []) {
          if (seenRelationships.has(relationship.id)) continue
          const otherId = relationship.personAId === personId ? relationship.personBId : relationship.personAId
          if (!householdMemberIds.has(otherId) && nearbyPeople.has(otherId)) {
            seenRelationships.add(relationship.id)
            ties.push(relationship.familiarity)
          }
        }
      }
      return ties.length === 0 ? 0 : Math.floor(ties.reduce((sum, tie) => sum + tie, 0) / ties.length)
    },
    moveHousehold(household, sourceCellId, destinationCellId) {
      const source = householdsByHomeCellId.get(sourceCellId)
      if (source) householdsByHomeCellId.set(sourceCellId, source.filter((candidate) => candidate.id !== household.id))
      addHousehold(householdsByHomeCellId, destinationCellId, household)
    },
  }
}

/**
 * Evaluates reachable homes; it never mutates state or draws randomness. The
 * engine resolves the returned probability with HOUSEHOLD_RELOCATION_STREAM.
 */
export function evaluateHouseholdRelocation(input: HouseholdRelocationInput): HouseholdRelocationEvaluation {
  const source = input.cells.find((cell) => cell.id === input.household.homeCellId)
  if (!source || source.movementCost <= 0) return { sourceCellId: input.household.homeCellId, probabilityPermille: 0 }
  const index = input.index ?? buildHouseholdRelocationIndex(input.cells, input.households, input.relationships, input.settlements)
  const cellsById = index.cellsById
  const householdPeople = input.household.memberIds
    .map((id) => input.peopleById.get(id))
    .filter((person): person is PersonState => person !== undefined)
  if (householdPeople.length === 0) return { sourceCellId: source.id, probabilityPermille: 0 }

  const sourceFood = index.foodAccess(source)
  const sourceCrowding = index.crowding(source.id, input.household.id)
  const averageHunger = Math.floor(householdPeople.reduce((sum, person) => sum + getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger), 0) / householdPeople.length)
  const averageRiskTolerance = Math.floor(householdPeople.reduce((sum, person) => sum + getPersonVariable(person.variables, PERSON_VARIABLE_ID.riskTolerance), 0) / householdPeople.length)
  const foodReservePressurePermille = foodReservePressure(input.household, householdPeople.length)
  const scarcityPressure = clamp(averageHunger + foodReservePressurePermille, 0, 1000)
  const candidateHomes = index.candidates(source)
  const candidates: HouseholdRelocationCandidate[] = []
  for (const destination of candidateHomes) {
    const pathResult = findPathDetailed({ width: 0, height: 0, cells: [...input.cells] }, source.id, destination.id, {
      cellById: cellsById,
      maxExpansions: HOUSEHOLD_RELOCATION.maximumPathExpansions,
    })
    if (input.diagnostics) input.diagnostics.pathExpansions += pathResult.expansions
    if (pathResult.truncated || !pathResult.path) continue
    const travelCost = pathResult.path.cellIds.slice(1).reduce((sum, cellId) => {
      const cell = cellsById.get(cellId)
      if (!cell) return sum
      const multiplier = input.roadCellIds.has(cell.id) ? ROAD_MOVEMENT_COST_MULTIPLIER_PERMILLE : 1000
      return sum + Math.floor(cell.movementCost * multiplier / 1000)
    }, 0)
    const foodAccessPermille = index.foodAccess(destination)
    const foodAccessDeltaPermille = foodAccessPermille - sourceFood
    const destinationCrowding = index.crowding(destination.id, input.household.id)
    const crowdingDelta = sourceCrowding - destinationCrowding
    const householdTiePermille = index.householdTies(destination, input.household)
    const travelCostPermille = Math.min(300, Math.floor(travelCost / 25))
    const riskCostPermille = Math.floor(travelCostPermille * (1000 - averageRiskTolerance) / 1000)
    const settlementFactors = settlementMigrationTrace(input.settlements ?? [], source.id, destination.id, householdTiePermille, foodAccessDeltaPermille, travelCost, index.settlementByCellId)
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
  const candidate = candidates.sort((first, second) => second.utilityPermille - first.utilityPermille || compareStableText(first.destinationCellId, second.destinationCellId))[0]
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

function localFoodAccess(local: readonly GeographicCell[]): number {
  const capacity = local.reduce((sum, cell) => sum + cell.resourceCapacity, 0)
  return capacity === 0 ? 0 : clamp(Math.floor(local.reduce((sum, cell) => sum + cell.foodAmount, 0) * 1000 / capacity), 0, 1000)
}

function axialNeighborhood(center: GeographicCell, radius: number, cellsByCoordinate: ReadonlyMap<string, GeographicCell>): GeographicCell[] {
  const cells: GeographicCell[] = []
  for (let qDelta = -radius; qDelta <= radius; qDelta += 1) {
    const minimumRDelta = Math.max(-radius, -qDelta - radius)
    const maximumRDelta = Math.min(radius, -qDelta + radius)
    for (let rDelta = minimumRDelta; rDelta <= maximumRDelta; rDelta += 1) {
      const cell = cellsByCoordinate.get(`${center.q + qDelta},${center.r + rDelta}`)
      if (cell) cells.push(cell)
    }
  }
  return cells
}

function addHousehold(index: Map<string, HouseholdState[]>, cellId: string, household: HouseholdState): void {
  const households = index.get(cellId)
  if (households) households.push(household)
  else index.set(cellId, [household])
}

function addRelationship(index: Map<string, RelationshipState[]>, personId: string, relationship: RelationshipState): void {
  const relationships = index.get(personId)
  if (relationships) relationships.push(relationship)
  else index.set(personId, [relationship])
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
