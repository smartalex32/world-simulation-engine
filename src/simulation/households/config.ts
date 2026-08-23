/** The 200-person default remains 50 families plus 50 single-adult households. */
export const INITIAL_HOUSEHOLD_TOPOLOGY = { familyCount: 50, singleAdultCount: 50, peoplePerFamily: 3, totalPeople: 200 } as const

export const HOUSEHOLD_GENERATION_STREAM = {
  childAge: 'population.households.childAge',
  ageRemainderHours: 'population.ageRemainderHours',
  curiosityInheritance: 'population.inheritance.person.trait.curiosity',
  placement: 'population.households.placement',
} as const

export const CHILD_AGE = {
  minimumYears: 6,
  maximumYears: 17,
  minimumParentAgeGapYears: 18,
} as const

export function personIdForOrdinal(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 9999) throw new RangeError('Person ordinal must be an integer from 1 through 9999')
  return `person-${ordinal.toString().padStart(4, '0')}`
}

export function householdIdForOrdinal(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 9999) throw new RangeError('Household ordinal must be an integer from 1 through 9999')
  return `household-${ordinal.toString().padStart(4, '0')}`
}
