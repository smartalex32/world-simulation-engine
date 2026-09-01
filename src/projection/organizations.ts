import type { OrganizationState, RelationshipState } from '../simulation/domain/types'
import type { ProjectedOrganizationProfile } from './types'
import { compareStableText } from '../shared/stableOrder'
import type { OrganizationDefinition } from '../simulation/organizations/types'

/**
 * Read-only group evidence. Membership alone creates neither a relationship,
 * reputation, shared wealth, nor a behavioral modifier.
 */
export function buildProjectedOrganizationProfiles(organizations: readonly OrganizationState[], relationships: readonly RelationshipState[], definitions: readonly OrganizationDefinition[] = [], lifecycle?: { latestMembershipTraces: readonly { tick: number; organizationId: string; personId: string; change: string; selected: boolean; rejectionReason?: string }[] }): ProjectedOrganizationProfile[] {
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
    return {
      id: organization.id,
      name: organization.name,
      kind: organization.kind,
      definitionName: definition?.name ?? organization.kind,
      purposeIds: [...(definition?.purposeIds ?? [])].sort(compareStableText),
      allowedMemberRoleIds: [...(definition?.memberRoleIds ?? [])].sort(compareStableText),
      locationCellId: organization.locationCellId,
      goal: organization.kind === 'school' ? 'education' : 'unspecified',
      memberCount: organization.members.length,
      roleCounts,
      serviceCapacity: organization.serviceCapacity,
      sharedRuleIds: [...organization.sharedRuleIds].sort(),
      lifecycleStatus: definition?.lifecycle?.formation ? 'eligible' as const : 'disabled' as const,
      ...(lifecycle?.latestMembershipTraces.filter((trace) => trace.organizationId === organization.id).at(-1) ? { latestMembershipEvidence: lifecycle.latestMembershipTraces.filter((trace) => trace.organizationId === organization.id).at(-1) } : {}),
      internalRelationshipCount: internalRelationships.length,
      internalAverageFamiliarity: internalRelationships.length === 0 ? 0 : Math.round(internalRelationships.reduce((sum, relationship) => sum + relationship.familiarity, 0) / internalRelationships.length),
      reputationStatus: 'not-measured',
      ownedResourcesStatus: 'not-modeled',
    }
  })
}
