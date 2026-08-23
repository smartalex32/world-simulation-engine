import { describe, expect, it } from 'vitest'
import { annualMortalityPermille, birthEligible, lifeStageForAge, partnershipEligible } from './model'
import type { PersonState, RelationshipState } from '../domain/types'

function person(id: string, ageYears = 25): PersonState {
  return { id, ageYears, ageHoursIntoYear: 0, locationCellId: '0,0', homeCellId: '0,0', householdId: `household-${id}`, activityScheduleId: 'activity.schedule.adult.v1', currentActivity: { kind: 'home', locationId: `activity.home.household-${id}`, sinceTick: 0 }, originTraces: [], development: { exposures: [] }, variables: {} as PersonState['variables'], knownCellIds: [] }
}

function relationship(first: string, second: string): RelationshipState {
  return { id: `${first}|${second}`, personAId: first, personBId: second, familiarity: 500, interactionFrequency: 0, interactionCount: 3, lastInteractionTick: 0, aToB: { affection: 500, trust: 500, respect: 0, fear: 0 }, bToA: { affection: 500, trust: 500, respect: 0, fear: 0 } }
}

describe('life-cycle model', () => {
  it('uses explicit, bounded life-stage transitions', () => {
    expect([0, 1, 2, 12, 13, 17, 18, 64, 65].map(lifeStageForAge)).toEqual(['infant', 'infant', 'child', 'child', 'adolescent', 'adolescent', 'adult', 'adult', 'olderAdult'])
  })

  it('has monotonic age-based mortality and a terminal maximum', () => {
    expect(annualMortalityPermille(20)).toBe(0)
    expect(annualMortalityPermille(80)).toBeGreaterThan(annualMortalityPermille(60))
    expect(annualMortalityPermille(120)).toBe(1000)
  })

  it('requires an actual, sufficiently positive relationship before partnership and birth', () => {
    const first = person('person-0001')
    const second = person('person-0002')
    const connection = relationship(first.id, second.id)
    expect(partnershipEligible(first, second, connection)).toBe(true)
    expect(birthEligible(first, second)).toBe(false)
    first.partnerId = second.id
    second.partnerId = first.id
    expect(birthEligible(first, second)).toBe(true)
    connection.aToB.trust = 499
    expect(partnershipEligible(person('person-0003'), person('person-0004'), connection)).toBe(false)
  })
})
