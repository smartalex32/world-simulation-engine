import { describe, expect, it } from 'vitest'
import { ACTIVITY_SCHEDULE_ID, resolveScheduledActivityKind, scheduleForAge } from './config'
import { commonsActivityId, householdHomeActivityId, resolveCurrentActivity } from './model'

describe('activity schedules', () => {
  it('uses exact child and adult schedule boundaries', () => {
    expect([0, 7, 8, 15, 16, 23].map((hour) => resolveScheduledActivityKind(ACTIVITY_SCHEDULE_ID.child, hour))).toEqual([
      'home', 'home', 'commons', 'commons', 'home', 'home',
    ])
    expect([0, 5, 6, 17, 18, 23].map((hour) => resolveScheduledActivityKind(ACTIVITY_SCHEDULE_ID.adult, hour))).toEqual([
      'home', 'home', 'commons', 'commons', 'home', 'home',
    ])
    expect(scheduleForAge(17)).toBe(ACTIVITY_SCHEDULE_ID.child)
    expect(scheduleForAge(18)).toBe(ACTIVITY_SCHEDULE_ID.adult)
  })

  it('never teleports a scheduled home activity and removes travelers from encounter pools', () => {
    const person = { personId: 'person-0001', ageYears: 30, householdId: 'household-001', householdHomeCellId: '4,5' }
    expect(resolveCurrentActivity({ ...person, locationCellId: '4,5' }, 5)).toEqual({
      kind: 'home', locationId: householdHomeActivityId('household-001'), cellId: '4,5', scheduleId: 'activity.schedule.adult.v1',
    })
    expect(resolveCurrentActivity({ ...person, locationCellId: '6,5' }, 5)).toEqual({
      kind: 'commons', locationId: commonsActivityId('6,5'), cellId: '6,5', scheduleId: 'activity.schedule.adult.v1',
    })
    expect(resolveCurrentActivity({ ...person, locationCellId: '4,5', journey: { kind: 'move' } }, 5)).toBeNull()
  })
})
