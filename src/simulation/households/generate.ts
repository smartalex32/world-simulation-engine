import { createCommonsActivity, createHouseholdHomeActivity } from '../activities/model'
import type { ActivityLocationState, HouseholdState, ParentChildLink } from '../domain/types'
import type { RandomProvider } from '../rng/pcg32'
import { CHILD_AGE, HOUSEHOLD_GENERATION_STREAM, INITIAL_HOUSEHOLD_TOPOLOGY, householdIdForOrdinal, personIdForOrdinal } from './config'

export interface HouseholdPersonInput {
  readonly id: string
  readonly ageYears: number
  readonly homeCellId: string
}

export interface PassableCellInput {
  readonly id: string
  readonly movementCost: number
}

export interface HouseholdPersonAssignment {
  readonly personId: string
  readonly householdId: string
  readonly homeCellId: string
  readonly ageYears: number
}

export interface HouseholdGenerationResult {
  readonly households: readonly HouseholdState[]
  readonly parentChildLinks: readonly ParentChildLink[]
  readonly activityLocations: readonly ActivityLocationState[]
  readonly personAssignments: readonly HouseholdPersonAssignment[]
}

/**
 * Produces the first fixed topology: 50 two-parent/one-child households and
 * 50 one-adult households. It returns assignments rather than mutating people.
 */
export function generateInitialHouseholds(
  people: readonly HouseholdPersonInput[],
  passableCells: readonly PassableCellInput[],
  random: RandomProvider,
): HouseholdGenerationResult {
  const peopleById = validateInitialPeople(people)
  const sortedPassableCells = passableCells
    .filter((cell) => cell.movementCost > 0)
    .sort((a, b) => compareText(a.id, b.id))
  if (sortedPassableCells.length === 0) throw new Error('Household generation requires at least one passable cell')
  if (new Set(sortedPassableCells.map((cell) => cell.id)).size !== sortedPassableCells.length) {
    throw new Error('Passable cell IDs must be unique')
  }

  const childAgeRng = random.stream(HOUSEHOLD_GENERATION_STREAM.childAge)
  const households: HouseholdState[] = []
  const parentChildLinks: ParentChildLink[] = []
  const assignments: HouseholdPersonAssignment[] = []

  for (let familyOrdinal = 1; familyOrdinal <= INITIAL_HOUSEHOLD_TOPOLOGY.familyCount; familyOrdinal += 1) {
    const parentAId = personIdForOrdinal(familyOrdinal)
    const parentBId = personIdForOrdinal(familyOrdinal + 50)
    const childId = personIdForOrdinal(familyOrdinal + 100)
    const parentA = requiredPerson(peopleById, parentAId)
    const parentB = requiredPerson(peopleById, parentBId)
    const childAgeYears = CHILD_AGE.minimumYears + childAgeRng.nextInt(CHILD_AGE.maximumYears - CHILD_AGE.minimumYears + 1)
    const householdId = householdIdForOrdinal(familyOrdinal)
    const homeCellId = parentA.homeCellId
    const memberIds = [parentAId, parentBId, childId]
    households.push({ id: householdId, homeCellId, homeActivityLocationId: `activity.home.${householdId}`, memberIds })
    assignments.push(
      assignment(parentA, householdId, homeCellId, childAgeYears + CHILD_AGE.minimumParentAgeGapYears),
      assignment(parentB, householdId, homeCellId, childAgeYears + CHILD_AGE.minimumParentAgeGapYears),
      { personId: childId, householdId, homeCellId, ageYears: childAgeYears },
    )
    parentChildLinks.push(
      { id: `${parentAId}|${childId}`, householdId, parentId: parentAId, childId },
      { id: `${parentBId}|${childId}`, householdId, parentId: parentBId, childId },
    )
  }

  for (let ordinal = 151; ordinal <= INITIAL_HOUSEHOLD_TOPOLOGY.totalPeople; ordinal += 1) {
    const person = requiredPerson(peopleById, personIdForOrdinal(ordinal))
    const householdId = householdIdForOrdinal(ordinal - 100)
    households.push({ id: householdId, homeCellId: person.homeCellId, homeActivityLocationId: `activity.home.${householdId}`, memberIds: [person.id] })
    assignments.push(assignment(person, householdId, person.homeCellId, 18))
  }

  // Activity IDs are the canonical persisted order, independent of creation source.
  const activityLocations = [
    ...households.map((household) => createHouseholdHomeActivity(household.id, household.homeCellId)),
    ...sortedPassableCells.map((cell) => createCommonsActivity(cell.id)),
  ].sort((a, b) => compareText(a.id, b.id))
  return {
    households,
    parentChildLinks: parentChildLinks.sort((a, b) => compareText(a.id, b.id)),
    activityLocations,
    personAssignments: assignments.sort((a, b) => compareText(a.personId, b.personId)),
  }
}

function assignment(person: HouseholdPersonInput, householdId: string, homeCellId: string, minimumAgeYears: number): HouseholdPersonAssignment {
  return { personId: person.id, householdId, homeCellId, ageYears: Math.max(person.ageYears, minimumAgeYears) }
}

function validateInitialPeople(people: readonly HouseholdPersonInput[]): Map<string, HouseholdPersonInput> {
  if (people.length !== INITIAL_HOUSEHOLD_TOPOLOGY.totalPeople) throw new Error('Initial household generation requires exactly 200 people')
  const peopleById = new Map(people.map((person) => [person.id, person]))
  if (peopleById.size !== people.length) throw new Error('Initial household person IDs must be unique')
  for (let ordinal = 1; ordinal <= INITIAL_HOUSEHOLD_TOPOLOGY.totalPeople; ordinal += 1) {
    requiredPerson(peopleById, personIdForOrdinal(ordinal))
  }
  return peopleById
}

function requiredPerson(peopleById: ReadonlyMap<string, HouseholdPersonInput>, id: string): HouseholdPersonInput {
  const person = peopleById.get(id)
  if (!person) throw new Error(`Initial household topology is missing ${id}`)
  return person
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
