import type { ActivityLocationId, ActivityLocationKind, ActivityLocationState, ActivityScheduleId } from '../domain/types'
import { resolveScheduledActivityKind, scheduleForAge } from './config'

export interface ActivityResolutionInput {
  readonly personId: string
  readonly ageYears: number
  readonly locationCellId: string
  readonly householdId: string
  readonly householdHomeCellId: string
  /** Any in-progress journey makes the person unavailable to an activity encounter pool. */
  readonly journey?: unknown
}

export interface ResolvedActivity {
  readonly kind: ActivityLocationKind
  readonly locationId: ActivityLocationId
  readonly cellId: string
  readonly scheduleId: ActivityScheduleId
}

export function householdHomeActivityId(householdId: string): ActivityLocationId {
  return `activity.home.${householdId}`
}

export function commonsActivityId(cellId: string): ActivityLocationId {
  return `activity.commons.${cellId}`
}

export function createHouseholdHomeActivity(householdId: string, homeCellId: string): ActivityLocationState {
  return { id: householdHomeActivityId(householdId), kind: 'home', cellId: homeCellId, householdId }
}

export function createCommonsActivity(cellId: string): ActivityLocationState {
  return { id: commonsActivityId(cellId), kind: 'commons', cellId }
}

/** Resolves a current encounter-pool location without changing physical position. */
export function resolveCurrentActivity(input: ActivityResolutionInput, hourOfDay: number): ResolvedActivity | null {
  if (input.journey !== undefined) return null

  const scheduleId = scheduleForAge(input.ageYears)
  const scheduledKind = resolveScheduledActivityKind(scheduleId, hourOfDay)
  if (scheduledKind === 'home' && input.locationCellId === input.householdHomeCellId) {
    return {
      kind: 'home',
      locationId: householdHomeActivityId(input.householdId),
      cellId: input.householdHomeCellId,
      scheduleId,
    }
  }

  return {
    kind: 'commons',
    locationId: commonsActivityId(input.locationCellId),
    cellId: input.locationCellId,
    scheduleId,
  }
}
