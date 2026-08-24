import { describe, expect, it } from 'vitest'
import { evaluateSchoolAttendance } from './attendance'
import { createDefaultPersonVariableValues } from '../variables/storage'
import { PERSON_VARIABLE_ID } from '../variables/registry'

const cells = [
  { id: '0,0', q: 0, r: 0, terrain: 'plain' as const, elevation: 0, habitability: 1000, movementCost: 1000, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0 },
  { id: '1,0', q: 1, r: 0, terrain: 'plain' as const, elevation: 0, habitability: 1000, movementCost: 1000, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0 },
]

function person(id: string, ageYears: number) {
  return { id, ageYears, homeCellId: '0,0', lifeStatus: 'alive' as const, variables: createDefaultPersonVariableValues({ [PERSON_VARIABLE_ID.curiosity]: 800, [PERSON_VARIABLE_ID.persistence]: 700 }) }
}

describe('school attendance', () => {
  it('uses route cost, household adult capacity, and traits in an explicit access evaluation', () => {
    const learner = person('learner', 10)
    const adult = person('adult', 30)
    const school = { id: 'school', name: 'School', kind: 'school' as const, locationCellId: '1,0', activityLocationId: 'activity.commons.1,0', members: [{ personId: learner.id, role: 'learner' as const }], serviceCapacity: 24, sharedRuleIds: [] }
    const household = { id: 'household', homeCellId: '0,0', homeActivityLocationId: 'activity.home.household', memberIds: [learner.id, adult.id] }
    const peopleById = new Map([[learner.id, learner], [adult.id, adult]])

    const unpaved = evaluateSchoolAttendance({ school, person: learner as never, household, peopleById: peopleById as never, cells, roadCellIds: new Set() })
    const paved = evaluateSchoolAttendance({ school, person: learner as never, household, peopleById: peopleById as never, cells, roadCellIds: new Set(['1,0']) })

    expect(unpaved.reason).toBe('available')
    expect(paved.travelCost).toBeLessThan(unpaved.travelCost ?? Infinity)
    expect(paved.probabilityPermille).toBeGreaterThan(unpaved.probabilityPermille)
  })

  it('does not treat a school enrollment as enough access without household support', () => {
    const learner = person('learner', 10)
    const school = { id: 'school', name: 'School', kind: 'school' as const, locationCellId: '1,0', activityLocationId: 'activity.commons.1,0', members: [{ personId: learner.id, role: 'learner' as const }], serviceCapacity: 24, sharedRuleIds: [] }
    const household = { id: 'household', homeCellId: '0,0', homeActivityLocationId: 'activity.home.household', memberIds: [learner.id] }
    const result = evaluateSchoolAttendance({ school, person: learner as never, household, peopleById: new Map([[learner.id, learner]]) as never, cells, roadCellIds: new Set() })

    expect(result).toMatchObject({ reason: 'no-household-capacity', probabilityPermille: 0 })
  })
})
