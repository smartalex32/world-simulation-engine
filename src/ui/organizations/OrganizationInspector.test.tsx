import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ProjectedOrganizationProfile } from '../../projection/types'
import { OrganizationInspector } from './OrganizationInspector'

const organization: ProjectedOrganizationProfile = {
  id: 'organization.school-1', name: 'Westhaven School', kind: 'school', definitionName: 'Village school', purposeIds: ['education'], allowedMemberRoleIds: ['learner', 'steward'], locationCellId: '2,3', goal: 'education', memberCount: 2, roleCounts: { learner: 2 }, serviceCapacity: 12, sharedRuleIds: ['attendance'], lifecycleStatus: 'formation-enabled', internalRelationshipCount: 1, internalAverageFamiliarity: 500,
  ownedResourcesStatus: 'owned-account', ownedCurrencyUnits: 0, ownedGoods: {}, latestAssetTransferEvidence: [], reputationStatus: 'observer-evidence', reputationByObserver: [{ observer: { kind: 'person', id: 'person-1' }, valuePermille: 510, lastObservationSequence: 2, lastObservedTick: 7 }], latestReputationEvidence: [{ sequence: 2, tick: 7, observer: { kind: 'person', id: 'person-1' }, source: 'service', causalEventId: 'event-1', previousValuePermille: 500, deltaPermille: 10, valuePermille: 510 }], leadershipStatus: 'filled', leaderPersonId: 'person-2', leaderRoleId: 'steward', leadershipTermStartedTick: 3, latestLeadershipEvidence: [{ sequence: 1, tick: 3, roleId: 'steward', outcome: 'selected', contested: false, candidates: [{ personId: 'person-2', memberRoleId: 'steward', relationshipSupportPermille: 500, organizationReputationPermille: 500, knowledgePermille: 500, persistencePermille: 500, finalScorePermille: 500 }], reason: 'highest score' }], decisionStatus: 'active', pendingDecisions: [{ sequence: 3, policyId: 'policy.fee', proposedTick: 8, resolvesAtTick: 12, participantIds: ['person-1'], participantRoles: [{ personId: 'person-1', memberRoleId: 'learner' }], alternatives: ['a', 'b'] }], latestDecisionResolutions: [], latestMembershipEvidence: { sequence: 2, tick: 4, organizationId: 'organization.school-1', personId: 'person-1', change: 'joined', nextRoleId: 'learner', baseProbabilityPermille: 500, factors: { activityPermille: 1000, proximityPermille: 1000, relationshipPermille: 500, interestPermille: 500, exposurePermille: 500 }, finalProbabilityPermille: 500, selected: true },
}

describe('OrganizationInspector', () => {
  it('explains the structural member limit without implying an evaluated transition', () => {
    const markup = renderToStaticMarkup(<OrganizationInspector organization={{ ...organization, structuralLimitReason: 'member-limit', memberCount: 129 }} onInspectPerson={() => undefined} onInspectOrganization={() => undefined} onShowMap={() => undefined} onShowHistory={() => undefined} />)
    expect(markup).toContain('exceeds the 128-member structural limit')
    expect(markup).toContain('are not evaluated while it exceeds this limit')
  })
  it('renders bounded projected evidence, zero balances, and native evidence disclosures', () => {
    const markup = renderToStaticMarkup(<OrganizationInspector organization={organization} onInspectPerson={() => undefined} onInspectOrganization={() => undefined} onShowMap={() => undefined} onShowHistory={() => undefined} />)
    expect(markup).toContain('ORGANIZATION EVIDENCE')
    expect(markup).toContain('Currency units')
    expect(markup).toContain('>0</strong>')
    expect(markup).toContain('currently records zero goods')
    expect(markup).toContain('Current by observer (showing 1 of 1 projected)')
    expect(markup).toContain('Leadership and succession evidence')
    expect(markup).toContain('<details')
    expect(markup).toContain('&quot;policyId&quot;: &quot;policy.fee&quot;')
  })

  it('distinguishes absent accounts and evidence systems from zero-valued accounts', () => {
    const markup = renderToStaticMarkup(<OrganizationInspector organization={{ ...organization, ownedResourcesStatus: 'owned-account', ownedCurrencyUnits: undefined, ownedGoods: undefined, reputationStatus: 'not-measured', reputationByObserver: undefined, latestReputationEvidence: undefined, leadershipStatus: 'not-modeled', leaderPersonId: undefined, leaderRoleId: undefined, leadershipTermStartedTick: undefined, latestLeadershipEvidence: undefined, decisionStatus: 'not-modeled', pendingDecisions: undefined, latestDecisionResolutions: undefined }} onInspectPerson={() => undefined} onInspectOrganization={() => undefined} onShowMap={() => undefined} onShowHistory={() => undefined} />)
    expect(markup).toContain('Owned account balance unavailable')
    expect(markup).toContain('Reputation not measured')
    expect(markup).toContain('Leadership not modeled')
    expect(markup).toContain('Decisions not modeled')
  })

  it('renders dissolved lineage and transition links to related organization inspectors', () => {
    const dissolved: ProjectedOrganizationProfile = { ...organization, status: 'dissolved', specialization: 'faction', lineage: { origin: 'schism', parentOrganizationIds: ['organization.parent'], formedTick: 9 }, latestTransitionEvidence: [{ sequence: 4, tick: 12, kind: 'schism', selected: true, membershipsBefore: [], membershipsAfter: [], resourcesBefore: [], sourceOrganizationIds: ['organization.parent'], resultOrganizationIds: ['organization.school-1', 'organization.child'], memberIds: ['person-1'], evidence: { livingMemberCount: 2, sharedMemberCount: 1, relationshipEvidenceCount: 1, relationshipPermille: 700, exposurePermille: 1000, interestPermille: 500, conflictPermille: 500, resourcePressurePermille: 0 }, resourceReconciliation: [], reason: 'recorded split' }] }
    const markup = renderToStaticMarkup(<OrganizationInspector organization={dissolved} onInspectPerson={() => undefined} onInspectOrganization={() => undefined} onShowMap={() => undefined} onShowHistory={() => undefined} />)
    expect(markup).toContain('dissolved')
    expect(markup).toContain('organization.parent')
    expect(markup).toContain('Organization: organization.child')
    expect(markup).toContain('Transition 4 · schism · tick 12')
  })
})
