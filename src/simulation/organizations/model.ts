import type { OrganizationState, PersonState } from '../domain/types'

/** First generic organization slice: deterministic local schools, without belief assignment. */
export function createInitialSchools(people: readonly PersonState[], anchorCellIds: readonly string[]): OrganizationState[] {
  const anchors = [...new Set(anchorCellIds)].sort()
  const schools = anchors.map((cellId, index): OrganizationState => {
    const id = `organization.school.${String(index + 1).padStart(3, '0')}`
    const members = people.filter((person) => person.ageYears < 18 && person.homeCellId === cellId)
      .map((person) => ({ personId: person.id, role: 'learner' as const }))
    return { id, name: `School ${index + 1}`, kind: 'school', locationCellId: cellId, activityLocationId: `activity.commons.${cellId}`, members, sharedRuleIds: ['organization.rule.attendance.v1'] }
  })
  return schools
}
