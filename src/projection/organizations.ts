import type { OrganizationState, RelationshipState } from '../simulation/domain/types'
import type { ProjectedOrganizationProfile } from './types'

/**
 * Read-only group evidence. Membership alone creates neither a relationship,
 * reputation, shared wealth, nor a behavioral modifier.
 */
export function buildProjectedOrganizationProfiles(organizations: readonly OrganizationState[], relationships: readonly RelationshipState[]): ProjectedOrganizationProfile[] {
  return [...organizations].sort((first, second) => first.id.localeCompare(second.id)).map((organization) => {
    const memberIds = new Set(organization.members.map((member) => member.personId))
    const internalRelationships = relationships
      .filter((relationship) => memberIds.has(relationship.personAId) && memberIds.has(relationship.personBId))
      .sort((first, second) => first.id.localeCompare(second.id))
    const roleCounts = organization.members.reduce((counts, member) => {
      counts[member.role] = (counts[member.role] ?? 0) + 1
      return counts
    }, {} as Record<string, number>)
    return {
      id: organization.id,
      name: organization.name,
      kind: organization.kind,
      locationCellId: organization.locationCellId,
      goal: organization.kind === 'school' ? 'education' : 'unspecified',
      memberCount: organization.members.length,
      roleCounts,
      serviceCapacity: organization.serviceCapacity,
      sharedRuleIds: [...organization.sharedRuleIds].sort(),
      internalRelationshipCount: internalRelationships.length,
      internalAverageFamiliarity: internalRelationships.length === 0 ? 0 : Math.round(internalRelationships.reduce((sum, relationship) => sum + relationship.familiarity, 0) / internalRelationships.length),
      reputationStatus: 'not-measured',
      ownedResourcesStatus: 'not-modeled',
    }
  })
}
