import { createCommonsActivity, createHouseholdHomeActivity } from '../activities/model'
import type { ActivityLocationState, HouseholdState, ParentChildLink, PopulationPlacementZone } from '../domain/types'
import { RandomProvider } from '../rng/pcg32'
import { CHILD_AGE, HOUSEHOLD_GENERATION_STREAM, householdIdForOrdinal, personIdForOrdinal } from './config'
import { initialInventory } from '../economy/model'

export interface HouseholdPersonInput { readonly id: string; readonly ageYears: number; readonly initialHomeCellId?: string }
export interface PassableCellInput { readonly id: string; readonly movementCost: number }
export interface HouseholdPersonAssignment { readonly personId: string; readonly householdId: string; readonly homeCellId: string; readonly ageYears: number }
export interface HouseholdGenerationResult { readonly households: readonly HouseholdState[]; readonly parentChildLinks: readonly ParentChildLink[]; readonly activityLocations: readonly ActivityLocationState[]; readonly personAssignments: readonly HouseholdPersonAssignment[] }

/** Variable three-person-family plus single-adult topology with exact zone totals. */
export function generateInitialHouseholds(people: readonly HouseholdPersonInput[], passableCells: readonly PassableCellInput[], random: RandomProvider): HouseholdGenerationResult
export function generateInitialHouseholds(people: readonly HouseholdPersonInput[], passableCells: readonly PassableCellInput[], zones: readonly PopulationPlacementZone[], random: RandomProvider, preserveLegacyHomePlacement?: boolean): HouseholdGenerationResult
export function generateInitialHouseholds(people: readonly HouseholdPersonInput[], passableCells: readonly PassableCellInput[], zonesOrRandom: readonly PopulationPlacementZone[] | RandomProvider, suppliedRandom?: RandomProvider, preserveLegacyHomePlacement = false): HouseholdGenerationResult {
  const random = zonesOrRandom instanceof RandomProvider ? zonesOrRandom : suppliedRandom
  if (!random) throw new Error('Household generation requires a random provider')
  const zones = zonesOrRandom instanceof RandomProvider
    ? [{ id: 'population-zone-0001', name: 'Initial population', cellIds: passableCells.filter((cell) => cell.movementCost > 0).map((cell) => cell.id).sort(compareText), populationCount: people.length }]
    : zonesOrRandom
  const peopleById = validatePeople(people)
  const passableIds = new Set(passableCells.filter((cell) => cell.movementCost > 0).map((cell) => cell.id))
  if (passableIds.size === 0) throw new Error('Household generation requires at least one passable cell')
  const familyCount = Math.min(Math.floor(people.length / 4), zones.reduce((sum, zone) => sum + Math.floor(zone.populationCount / 3), 0))
  const zonePlans = allocateFamilies(zones, familyCount, people.length)
  const households: HouseholdState[] = []
  const parentChildLinks: ParentChildLink[] = []
  const assignments: HouseholdPersonAssignment[] = []
  const childAgeRng = random.stream(HOUSEHOLD_GENERATION_STREAM.childAge)
  const placementRng = random.stream(HOUSEHOLD_GENERATION_STREAM.placement)
  let householdOrdinal = 1
  let allocatedFamilies = 0
  for (const zone of zonePlans) while (zone.families > 0) {
    const familyOrdinal = allocatedFamilies + 1
    const parentAId = personIdForOrdinal(familyOrdinal)
    const parentBId = personIdForOrdinal(familyOrdinal + familyCount)
    const childId = personIdForOrdinal(familyOrdinal + familyCount * 2)
    const homeCellId = legacyHome(requiredPerson(peopleById, parentAId), zone, passableIds, placementRng, preserveLegacyHomePlacement)
    const childAgeYears = CHILD_AGE.minimumYears + childAgeRng.nextInt(CHILD_AGE.maximumYears - CHILD_AGE.minimumYears + 1)
    addFamily({ peopleById, households, parentChildLinks, assignments, householdOrdinal, homeCellId, parentAId, parentBId, childId, childAgeYears })
    householdOrdinal += 1
    allocatedFamilies += 1
    zone.families -= 1
    zone.remaining -= 3
  }
  let singleOrdinal = familyCount * 3 + 1
  for (const zone of zonePlans) while (zone.remaining > 0) {
    const personId = personIdForOrdinal(singleOrdinal++)
    const person = requiredPerson(peopleById, personId)
    const householdId = householdIdForOrdinal(householdOrdinal++)
    const homeCellId = legacyHome(person, zone, passableIds, placementRng, preserveLegacyHomePlacement)
    households.push({ id: householdId, homeCellId, homeActivityLocationId: `activity.home.${householdId}`, memberIds: [personId], inventory: initialInventory(1) })
    assignments.push({ personId, householdId, homeCellId, ageYears: Math.max(person.ageYears, 18) })
    zone.remaining -= 1
  }
  if (singleOrdinal !== people.length + 1) throw new Error('Household generation did not allocate every initial person')
  const sortedPassableCells = [...passableIds].sort(compareText)
  return {
    households: households.sort((a, b) => compareText(a.id, b.id)),
    parentChildLinks: parentChildLinks.sort((a, b) => compareText(a.id, b.id)),
    activityLocations: [...households.map((household) => createHouseholdHomeActivity(household.id, household.homeCellId)), ...sortedPassableCells.map((id) => createCommonsActivity(id))].sort((a, b) => compareText(a.id, b.id)),
    personAssignments: assignments.sort((a, b) => compareText(a.personId, b.personId)),
  }
}

/** Apportions the global family target by population without confounding equal zones with different household mixes. */
function allocateFamilies(zones: readonly PopulationPlacementZone[], familyCount: number, populationCount: number) {
  const plans = zones.map((zone) => {
    const capacity = Math.floor(zone.populationCount / 3)
    const idealNumerator = familyCount * zone.populationCount
    return {
      ...zone,
      remaining: zone.populationCount,
      capacity,
      idealNumerator,
      families: Math.min(capacity, Math.floor(idealNumerator / populationCount)),
    }
  })
  let unallocated = familyCount - plans.reduce((sum, plan) => sum + plan.families, 0)
  while (unallocated > 0) {
    const candidate = plans
      .filter((plan) => plan.families < plan.capacity)
      .sort((first, second) => (second.idealNumerator - second.families * populationCount) - (first.idealNumerator - first.families * populationCount) || compareText(first.id, second.id))[0]
    if (!candidate) throw new Error('Household family allocation exceeds zone capacity')
    candidate.families += 1
    unallocated -= 1
  }
  return plans
}

function legacyHome(person: HouseholdPersonInput, zone: PopulationPlacementZone, passableIds: ReadonlySet<string>, random: ReturnType<RandomProvider['stream']>, preserve: boolean): string {
  if (preserve && person.initialHomeCellId && zone.cellIds.includes(person.initialHomeCellId) && passableIds.has(person.initialHomeCellId)) return person.initialHomeCellId
  return selectHome(zone, passableIds, random)
}

function addFamily(input: { peopleById: ReadonlyMap<string, HouseholdPersonInput>; households: HouseholdState[]; parentChildLinks: ParentChildLink[]; assignments: HouseholdPersonAssignment[]; householdOrdinal: number; homeCellId: string; parentAId: string; parentBId: string; childId: string; childAgeYears: number }): void {
  const householdId = householdIdForOrdinal(input.householdOrdinal)
  const parentA = requiredPerson(input.peopleById, input.parentAId)
  const parentB = requiredPerson(input.peopleById, input.parentBId)
  requiredPerson(input.peopleById, input.childId)
  input.households.push({ id: householdId, homeCellId: input.homeCellId, homeActivityLocationId: `activity.home.${householdId}`, memberIds: [input.parentAId, input.parentBId, input.childId].sort(compareText), inventory: initialInventory(3) })
  input.assignments.push(
    { personId: input.parentAId, householdId, homeCellId: input.homeCellId, ageYears: Math.max(parentA.ageYears, input.childAgeYears + CHILD_AGE.minimumParentAgeGapYears) },
    { personId: input.parentBId, householdId, homeCellId: input.homeCellId, ageYears: Math.max(parentB.ageYears, input.childAgeYears + CHILD_AGE.minimumParentAgeGapYears) },
    { personId: input.childId, householdId, homeCellId: input.homeCellId, ageYears: input.childAgeYears },
  )
  input.parentChildLinks.push({ id: `${input.parentAId}|${input.childId}`, householdId, parentId: input.parentAId, childId: input.childId }, { id: `${input.parentBId}|${input.childId}`, householdId, parentId: input.parentBId, childId: input.childId })
}

function selectHome(zone: PopulationPlacementZone, passableIds: ReadonlySet<string>, random: ReturnType<RandomProvider['stream']>): string {
  const candidates = zone.cellIds.filter((id) => passableIds.has(id))
  if (candidates.length === 0) throw new Error(`Population zone ${zone.id} has no passable home cells`)
  return candidates[random.nextInt(candidates.length)] as string
}

function validatePeople(people: readonly HouseholdPersonInput[]): Map<string, HouseholdPersonInput> {
  const peopleById = new Map(people.map((person) => [person.id, person]))
  if (peopleById.size !== people.length) throw new Error('Initial household person IDs must be unique')
  for (let ordinal = 1; ordinal <= people.length; ordinal += 1) requiredPerson(peopleById, personIdForOrdinal(ordinal))
  return peopleById
}

function requiredPerson(peopleById: ReadonlyMap<string, HouseholdPersonInput>, id: string): HouseholdPersonInput { const person = peopleById.get(id); if (!person) throw new Error(`Initial household topology is missing ${id}`); return person }
function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }
