import { describe, expect, it } from 'vitest'
import { buildProjectedOrganizationProfiles } from './organizations'

describe('organization projection', () => {
  it('shows explicit membership roles and only relationships that actually exist between members', () => {
    const profiles = buildProjectedOrganizationProfiles([
      { id: 'school-2', name: 'Second School', kind: 'school', locationCellId: '2,0', activityLocationId: 'activity.commons.2,0', members: [], serviceCapacity: 24, sharedRuleIds: [] },
      { id: 'school-1', name: 'First School', kind: 'school', locationCellId: '0,0', activityLocationId: 'activity.commons.0,0', members: [{ personId: 'b', role: 'learner' }, { personId: 'a', role: 'learner' }], serviceCapacity: 24, sharedRuleIds: ['organization.rule.attendance.v1'] },
    ], [
      { id: 'outside', personAId: 'a', personBId: 'c', familiarity: 900 },
      { id: 'inside', personAId: 'a', personBId: 'b', familiarity: 400 },
    ] as never, [{ id: 'school', name: 'School', purposeIds: ['education'], memberRoleIds: ['learner', 'educator'], sharedRuleIds: ['organization.rule.attendance.v1'], initialService: { location: 'settlement-anchor', activityLocation: 'commons', serviceCapacity: 24 } }])
    expect(profiles).toEqual([
      expect.objectContaining({ id: 'school-1', definitionName: 'School', purposeIds: ['education'], allowedMemberRoleIds: ['educator', 'learner'], goal: 'education', memberCount: 2, roleCounts: { learner: 2 }, internalRelationshipCount: 1, internalAverageFamiliarity: 400, reputationStatus: 'not-measured', ownedResourcesStatus: 'not-modeled' }),
      expect.objectContaining({ id: 'school-2', memberCount: 0, internalRelationshipCount: 0, internalAverageFamiliarity: 0 }),
    ])
  })
})
