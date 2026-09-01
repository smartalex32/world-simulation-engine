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

  it('projects pack-defined lifecycle status and a detached copy of the latest membership evidence', () => {
    const evidence = { sequence: 1, tick: 24, organizationId: 'circle-1', personId: 'b', change: 'joined' as const, nextRoleId: 'member', baseProbabilityPermille: 100, factors: { activityPermille: 1000, proximityPermille: 1000, relationshipPermille: 0, interestPermille: 500, exposurePermille: 0 }, finalProbabilityPermille: 225, rngStream: 'organization.lifecycle', randomRollPermille: 0, selected: true }
    const profiles = buildProjectedOrganizationProfiles([
      { id: 'circle-1', name: 'Circle', kind: 'study-circle', locationCellId: '1,1', activityLocationId: 'activity.commons.1,1', members: [{ personId: 'b', role: 'member' }], serviceCapacity: 8, sharedRuleIds: [] },
    ], [], [{ id: 'study-circle', name: 'Study circle', purposeIds: ['education'], memberRoleIds: ['member', 'steward'], sharedRuleIds: [], initialService: { location: 'settlement-anchor', activityLocation: 'commons', serviceCapacity: 8 }, lifecycle: { cadenceHours: 24, formation: { enabled: true, baseProbabilityPermille: 80 }, membership: { enabled: true, defaultRoleId: 'member', baseJoinProbabilityPermille: 120, baseRoleChangeProbabilityPermille: 20, baseLeaveProbabilityPermille: 10, roleChangeInterestThresholdPermille: 750 } } }], { nextOrganizationSequence: 2, nextTraceSequence: 2, latestFormationTraces: [], latestMembershipTraces: [evidence] })

    expect(profiles[0]).toMatchObject({ goal: 'education', lifecycleStatus: 'formation-enabled', latestMembershipEvidence: evidence })
    expect(profiles[0]!.latestMembershipEvidence).not.toBe(evidence)
    expect(profiles[0]!.latestMembershipEvidence?.factors).not.toBe(evidence.factors)
  })
})
