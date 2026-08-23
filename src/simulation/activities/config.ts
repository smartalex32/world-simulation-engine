import type { ActivityLocationKind, ActivityScheduleId } from '../domain/types'

/** Small deterministic activity schedules for the first household slice. */
export interface ActivitySchedulePeriod {
  readonly startHour: number
  readonly endHourExclusive: number
  readonly kind: ActivityLocationKind
}

export interface ActivityScheduleDefinition {
  readonly id: ActivityScheduleId
  readonly periods: readonly ActivitySchedulePeriod[]
}

export const ACTIVITY_SCHEDULE_ID = {
  child: 'activity.schedule.child.v1',
  adolescent: 'activity.schedule.adolescent.v1',
  adult: 'activity.schedule.adult.v1',
} as const satisfies Record<'child' | 'adolescent' | 'adult', ActivityScheduleId>

export const ACTIVITY_SCHEDULES: readonly ActivityScheduleDefinition[] = [
  {
    id: ACTIVITY_SCHEDULE_ID.adolescent,
    periods: [
      { startHour: 0, endHourExclusive: 7, kind: 'home' },
      { startHour: 7, endHourExclusive: 18, kind: 'commons' },
      { startHour: 18, endHourExclusive: 24, kind: 'home' },
    ],
  },
  {
    id: ACTIVITY_SCHEDULE_ID.child,
    periods: [
      { startHour: 0, endHourExclusive: 8, kind: 'home' },
      { startHour: 8, endHourExclusive: 16, kind: 'commons' },
      { startHour: 16, endHourExclusive: 24, kind: 'home' },
    ],
  },
  {
    id: ACTIVITY_SCHEDULE_ID.adult,
    periods: [
      { startHour: 0, endHourExclusive: 6, kind: 'home' },
      { startHour: 6, endHourExclusive: 18, kind: 'commons' },
      { startHour: 18, endHourExclusive: 24, kind: 'home' },
    ],
  },
] as const

const SCHEDULES_BY_ID = new Map(ACTIVITY_SCHEDULES.map((schedule) => [schedule.id, schedule]))

export function scheduleForAge(ageYears: number): ActivityScheduleId {
  if (!Number.isInteger(ageYears) || ageYears < 0) throw new RangeError('Age must be a non-negative integer')
  return ageYears < 18 ? ACTIVITY_SCHEDULE_ID.child : ACTIVITY_SCHEDULE_ID.adult
}

export function getActivitySchedule(id: ActivityScheduleId): ActivityScheduleDefinition {
  const schedule = SCHEDULES_BY_ID.get(id)
  if (!schedule) throw new Error(`Unknown activity schedule: ${id}`)
  return schedule
}

export function resolveScheduledActivityKind(scheduleId: ActivityScheduleId, hourOfDay: number): ActivityLocationKind {
  if (!Number.isInteger(hourOfDay) || hourOfDay < 0 || hourOfDay >= 24) {
    throw new RangeError('Activity schedule hour must be an integer from 0 through 23')
  }
  const period = getActivitySchedule(scheduleId).periods.find(({ startHour, endHourExclusive }) => hourOfDay >= startHour && hourOfDay < endHourExclusive)
  if (!period) throw new Error(`Schedule ${scheduleId} does not cover hour ${hourOfDay}`)
  return period.kind
}
