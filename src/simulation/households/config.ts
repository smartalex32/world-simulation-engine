/** Fixed initial topology for the first 200-person validation population. */
export const INITIAL_HOUSEHOLD_TOPOLOGY = {
  familyCount: 50,
  singleAdultCount: 50,
  peoplePerFamily: 3,
  totalPeople: 200,
} as const

export const HOUSEHOLD_GENERATION_STREAM = {
  childAge: 'population.households.childAge',
  ageRemainderHours: 'population.ageRemainderHours',
  curiosityInheritance: 'population.inheritance.person.trait.curiosity',
} as const

export const CHILD_AGE = {
  minimumYears: 6,
  maximumYears: 17,
  minimumParentAgeGapYears: 18,
} as const

export function personIdForOrdinal(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > INITIAL_HOUSEHOLD_TOPOLOGY.totalPeople) {
    throw new RangeError('Initial household person ordinal must be an integer from 1 through 200')
  }
  return `person-${ordinal.toString().padStart(4, '0')}`
}

export function householdIdForOrdinal(ordinal: number): string {
  const householdCount = INITIAL_HOUSEHOLD_TOPOLOGY.familyCount + INITIAL_HOUSEHOLD_TOPOLOGY.singleAdultCount
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > householdCount) {
    throw new RangeError('Initial household ordinal must be an integer from 1 through 100')
  }
  return `household-${ordinal.toString().padStart(4, '0')}`
}
