import type { LocalGovernanceState, OrganizationState, PersonState } from '../simulation/domain/types'
import { evaluateLegitimacy } from '../simulation/governance/model'
import type { ProjectedCommunityState, ProjectedGovernanceProfile } from './types'
import { compareStableText } from '../shared/stableOrder'

/**
 * Governance projection keeps observed geographic catchments separate from
 * territory, civic membership, culture, and identity. It does not create a
 * council organization merely because an early governance record references one.
 */
export function buildProjectedGovernanceProfiles(governance: readonly LocalGovernanceState[], communities: readonly ProjectedCommunityState[], people: readonly PersonState[], organizations: readonly OrganizationState[]): ProjectedGovernanceProfile[] {
  const communityById = new Map(communities.map((community) => [community.catchment.id, community]))
  const peopleById = new Map(people.map((person) => [person.id, person]))
  const organizationIds = new Set(organizations.map((organization) => organization.id))
  return [...governance].sort((first, second) => compareStableText(first.id, second.id)).map((record) => {
    const community = communityById.get(record.communityId)
    const representativeIds = [...new Set(record.representativeIds)].sort()
    const legitimacy = evaluateLegitimacy({ serviceAccessPermille: record.serviceAccessPermille, contributionFairnessPermille: record.contributionFairnessPermille, socialTrustPermille: community?.emergent?.['community.emergent.socialTrust'] ?? 0, conflictPermille: community?.emergent?.['community.emergent.conflict'] ?? 1000 })
    return {
      id: record.id,
      communityId: record.communityId,
      catchmentName: community?.catchment.displayName ?? record.communityId,
      catchmentCellCount: community?.catchment.cellCount ?? 0,
      representativeIds,
      activeRepresentativeCount: representativeIds.filter((id) => peopleById.get(id)?.lifeStatus !== 'dead').length,
      councilOrganizationId: record.councilOrganizationId,
      councilOrganizationStatus: organizationIds.has(record.councilOrganizationId) ? 'recorded' : 'referenced-not-modeled',
      legitimacyPermille: record.legitimacy,
      legitimacyFactors: [
        { id: 'food-relief-access', label: 'Food-relief access', valuePermille: legitimacy.serviceAccessPermille },
        { id: 'contribution-fairness', label: 'Contribution fairness', valuePermille: legitimacy.contributionFairnessPermille },
        { id: 'social-trust', label: 'Social trust', valuePermille: legitimacy.socialTrustPermille },
        { id: 'conflict-absence', label: 'Conflict absence', valuePermille: legitimacy.conflictAbsencePermille },
      ],
      evaluatedLegitimacyPermille: legitimacy.legitimacyPermille,
      serviceAccessPermille: record.serviceAccessPermille,
      contributionFairnessPermille: record.contributionFairnessPermille,
      publicGood: record.publicGood,
      lastUpdatedTick: record.lastUpdatedTick,
      jurisdictionBasis: 'geographic-catchment',
      territoryStatus: 'not-modeled',
      civicMembershipStatus: 'not-modeled',
      cultureAndIdentityStatus: 'separate-not-inferred',
      taxationStatus: 'not-modeled', budgetStatus: 'not-modeled', lawAndEnforcementStatus: 'not-modeled', corruptionStatus: 'not-modeled',
    }
  })
}
