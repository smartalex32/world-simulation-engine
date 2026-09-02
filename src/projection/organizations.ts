import type { OrganizationState, RelationshipState } from '../simulation/domain/types'
import type { ProjectedOrganizationProfile } from './types'
import { compareStableText } from '../shared/stableOrder'
import type { OrganizationDefinition, OrganizationLifecycleState } from '../simulation/organizations/types'

/**
 * Read-only group evidence. Membership alone creates neither a relationship,
 * reputation, shared wealth, nor a behavioral modifier.
 */
export function buildProjectedOrganizationProfiles(organizations: readonly OrganizationState[], relationships: readonly RelationshipState[], definitions: readonly OrganizationDefinition[] = [], lifecycle?: OrganizationLifecycleState): ProjectedOrganizationProfile[] {
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]))
  return [...organizations].sort((first, second) => compareStableText(first.id, second.id)).map((organization) => {
    const memberIds = new Set(organization.members.map((member) => member.personId))
    const internalRelationships = relationships
      .filter((relationship) => memberIds.has(relationship.personAId) && memberIds.has(relationship.personBId))
      .sort((first, second) => compareStableText(first.id, second.id))
    const roleCounts = organization.members.reduce((counts, member) => {
      counts[member.role] = (counts[member.role] ?? 0) + 1
      return counts
    }, {} as Record<string, number>)
    const definition = definitionById.get(organization.kind)
    const latestMembershipEvidence = lifecycle?.latestMembershipTraces.filter((trace) => trace.organizationId === organization.id).at(-1)
    const lifecycleStatus = definition?.lifecycle?.formation.enabled
      ? 'formation-enabled' as const
      : definition?.lifecycle?.membership.enabled
        ? 'membership-only' as const
        : 'disabled' as const
    return {
      id: organization.id,
      name: organization.name,
      kind: organization.kind,
      definitionName: definition?.name ?? organization.kind,
      purposeIds: [...(definition?.purposeIds ?? [])].sort(compareStableText),
      allowedMemberRoleIds: [...(definition?.memberRoleIds ?? [])].sort(compareStableText),
      locationCellId: organization.locationCellId,
      goal: definition?.purposeIds.includes('education') ? 'education' : 'unspecified',
      memberCount: organization.members.length,
      roleCounts,
      serviceCapacity: organization.serviceCapacity,
      sharedRuleIds: [...organization.sharedRuleIds].sort(),
      lifecycleStatus,
      ...(latestMembershipEvidence ? { latestMembershipEvidence: structuredClone(latestMembershipEvidence) } : {}),
      internalRelationshipCount: internalRelationships.length,
      internalAverageFamiliarity: internalRelationships.length === 0 ? 0 : Math.round(internalRelationships.reduce((sum, relationship) => sum + relationship.familiarity, 0) / internalRelationships.length),
      reputationStatus: organization.reputationLedger ? 'observer-evidence' : 'not-measured',
      ownedResourcesStatus: organization.assets ? 'owned-account' : 'not-modeled',
      ...(organization.assets ? { ownedCurrencyUnits: organization.assets.currencyUnits, ownedGoods: { ...organization.assets.goods }, latestAssetTransferEvidence: organization.assets.latestTransferTraces.slice(-8).map((entry) => structuredClone(entry)) } : {}),
      ...(organization.reputationLedger ? { latestReputationEvidence: organization.reputationLedger.observations.slice(-8).map((entry) => structuredClone(entry)), reputationByObserver: organization.reputationLedger.currentByObserver.map((entry) => structuredClone(entry)) } : {}),
      leadershipStatus: organization.leadership ? organization.leadership.leaderPersonId ? 'filled' : 'vacant' : 'not-modeled',
      ...(organization.leadership ? { leaderRoleId: organization.leadership.roleId, ...(organization.leadership.leaderPersonId ? { leaderPersonId: organization.leadership.leaderPersonId, leadershipTermStartedTick: organization.leadership.termStartedTick } : {}), latestLeadershipEvidence: organization.leadership.latestTraces.slice(-8).map((entry) => structuredClone(entry)) } : {}),
      decisionStatus: organization.decisions ? 'active' : 'not-modeled',
      ...(organization.decisions ? { pendingDecisions: organization.decisions.pending.map((entry) => structuredClone(entry)), latestDecisionResolutions: organization.decisions.latestResolutions.slice(-8).map((entry) => structuredClone(entry)) } : {}),
    }
  })
}
