import { describe, expect, it } from 'vitest'
import type { PersonState } from '../domain/types'
import { createDefaultPersonVariableValues } from '../variables/storage'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { healthStressMortalityRiskPermille, resolveDailyHealthStress } from './model'

function person(): PersonState {
  return { id: 'person-1', ageYears: 30, ageHoursIntoYear: 0, locationCellId: '0,0', homeCellId: '0,0', householdId: 'household-1', activityScheduleId: 'activity.schedule.adult.v1', currentActivity: { kind: 'home', locationId: 'activity.home.household-1', sinceTick: 0 }, originTraces: [], development: { exposures: [] }, variables: createDefaultPersonVariableValues({ [PERSON_VARIABLE_ID.hunger]: 200 }), knownCellIds: ['0,0'] }
}

describe('fictional health stress', () => {
  it('assigns greater stress to the same person under dense, water-poor exposure', () => {
    const low = person(); low.healthExposure = { observedHours: 24, crowdingPersonHours: 24, coPresenceHours: 0, waterAvailabilityPermilleHours: 24_000 }
    const high = person(); high.healthExposure = { observedHours: 24, crowdingPersonHours: 240, coPresenceHours: 216, waterAvailabilityPermilleHours: 4_800 }
    expect(resolveDailyHealthStress(high, 24).currentValue).toBeGreaterThan(resolveDailyHealthStress(low, 24).currentValue)
  })

  it('keeps mortality pressure bounded and only applies at high stress', () => {
    expect(healthStressMortalityRiskPermille(599)).toBe(0)
    expect(healthStressMortalityRiskPermille(1000)).toBeGreaterThan(0)
  })
})
