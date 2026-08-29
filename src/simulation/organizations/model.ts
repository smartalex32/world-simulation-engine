import type { OrganizationState, PersonState } from '../domain/types'
import { SCHOOL_ATTENDANCE } from './attendance'
import { compareStableText } from '../../shared/stableOrder'

/** First generic organization slice: deterministic local schools, without belief assignment. */
export function createInitialSchools(people: readonly PersonState[], anchorCellIds: readonly string[]): OrganizationState[] {
  const anchors = [...new Set(anchorCellIds)].sort()
  const schools = anchors.map((cellId, index): OrganizationState => {
    const id = `organization.school.${String(index + 1).padStart(3, '0')}`
    const members = people.filter((person) => person.ageYears < 18 && nearestAnchor(person.homeCellId, anchors) === cellId)
      .map((person) => ({ personId: person.id, role: 'learner' as const }))
    return { id, name: `School ${index + 1}`, kind: 'school', locationCellId: cellId, activityLocationId: `activity.commons.${cellId}`, members, serviceCapacity: SCHOOL_ATTENDANCE.serviceCapacity, sharedRuleIds: ['organization.rule.attendance.v1'] }
  })
  return schools
}

function nearestAnchor(homeCellId: string, anchors: readonly string[]): string | undefined {
  const home = coordinate(homeCellId)
  return anchors.slice().sort((first, second) => hexDistance(home, coordinate(first)) - hexDistance(home, coordinate(second)) || compareStableText(first, second))[0]
}

function coordinate(cellId: string): { q: number; r: number } {
  const values = cellId.split(',').map(Number)
  const q = values[0]
  const r = values[1]
  if (q === undefined || r === undefined || !Number.isInteger(q) || !Number.isInteger(r)) throw new Error(`Invalid organization cell ID ${cellId}`)
  return { q, r }
}

function hexDistance(first: { q: number; r: number }, second: { q: number; r: number }): number {
  return Math.max(Math.abs(first.q - second.q), Math.abs(first.r - second.r), Math.abs((-first.q - first.r) - (-second.q - second.r)))
}
