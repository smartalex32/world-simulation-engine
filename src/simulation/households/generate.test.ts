import { describe, expect, it } from 'vitest'
import { RandomProvider } from '../rng/pcg32'
import { CHILD_AGE, HOUSEHOLD_GENERATION_STREAM, INITIAL_HOUSEHOLD_TOPOLOGY } from './config'
import { generateInitialHouseholds } from './generate'

function peopleFixture() {
  return Array.from({ length: 200 }, (_, index) => ({
    id: `person-${(index + 1).toString().padStart(4, '0')}`,
    ageYears: 18 + (index % 30),
    homeCellId: `${index % 4},${Math.floor(index / 4) % 3}`,
  }))
}

describe('initial household generation', () => {
  it('creates the fixed 50-family plus 50-single topology with canonical links and activity locations', () => {
    const result = generateInitialHouseholds(peopleFixture(), [{ id: '2,0', movementCost: 1000 }, { id: '0,0', movementCost: 1000 }, { id: '1,0', movementCost: 0 }], new RandomProvider('topology'))
    expect(result.households).toHaveLength(100)
    expect(result.parentChildLinks).toHaveLength(100)
    expect(result.personAssignments).toHaveLength(INITIAL_HOUSEHOLD_TOPOLOGY.totalPeople)
    expect(result.households[0]).toMatchObject({ id: 'household-0001', memberIds: ['person-0001', 'person-0051', 'person-0101'] })
    expect(result.households[50]).toMatchObject({ id: 'household-0051', memberIds: ['person-0151'] })
    expect(result.parentChildLinks.slice(0, 2)).toEqual([
      { id: 'person-0001|person-0101', householdId: 'household-0001', parentId: 'person-0001', childId: 'person-0101' },
      { id: 'person-0002|person-0102', householdId: 'household-0002', parentId: 'person-0002', childId: 'person-0102' },
    ])
    expect(result.activityLocations.map((location) => location.id)).toEqual([
      'activity.commons.0,0', 'activity.commons.2,0',
      ...Array.from({ length: 100 }, (_, index) => `activity.home.household-${(index + 1).toString().padStart(4, '0')}`),
    ])
    const assignments = new Map(result.personAssignments.map((assignment) => [assignment.personId, assignment]))
    for (let family = 1; family <= 50; family += 1) {
      const child = assignments.get(`person-${(family + 100).toString().padStart(4, '0')}`)
      const parentA = assignments.get(`person-${family.toString().padStart(4, '0')}`)
      const parentB = assignments.get(`person-${(family + 50).toString().padStart(4, '0')}`)
      expect(child?.ageYears).toBeGreaterThanOrEqual(CHILD_AGE.minimumYears)
      expect(child?.ageYears).toBeLessThanOrEqual(CHILD_AGE.maximumYears)
      expect(parentA?.ageYears).toBeGreaterThanOrEqual((child?.ageYears ?? 0) + CHILD_AGE.minimumParentAgeGapYears)
      expect(parentB?.ageYears).toBeGreaterThanOrEqual((child?.ageYears ?? 0) + CHILD_AGE.minimumParentAgeGapYears)
    }
  })

  it('is exactly reproducible for the same seed and owns its child-age stream', () => {
    const randomA = new RandomProvider('repeatable-households')
    const randomB = new RandomProvider('repeatable-households')
    const input = peopleFixture()
    expect(generateInitialHouseholds(input, [{ id: '0,0', movementCost: 1000 }], randomA)).toEqual(
      generateInitialHouseholds(input, [{ id: '0,0', movementCost: 1000 }], randomB),
    )
    expect(randomA.snapshot().map((stream) => stream.name)).toContain(HOUSEHOLD_GENERATION_STREAM.childAge)
  })
})
