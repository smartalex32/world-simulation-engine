import type { CommunitySimulationState } from '../community/types'
import type { LocalGovernanceState, PersonState } from '../domain/types'

export function createLocalGovernance(communities: readonly CommunitySimulationState[], people: readonly PersonState[]): LocalGovernanceState[] {
  return communities.map((community) => {
    const representativeIds = people.filter((person) => community.catchment.cellIds.includes(person.homeCellId) && person.ageYears >= 18).map((person) => person.id).sort().slice(0, 3)
    return { id: `governance.${community.catchment.id}`, communityId: community.catchment.id, councilOrganizationId: `organization.council.${community.catchment.id}`, representativeIds, legitimacy: 500, publicGood: 'food-relief', serviceAccessPermille: 0, contributionFairnessPermille: 500, lastUpdatedTick: 0 }
  })
}

/** Legitimacy is an inspectable local aggregate, not a belief assignment to residents. */
export function updateLegitimacy(governance: LocalGovernanceState, community: CommunitySimulationState, tick: number): void {
  governance.serviceAccessPermille = community.structural['community.structural.foodSecurity']
  governance.contributionFairnessPermille = community.emergent['community.emergent.cooperation']
  governance.legitimacy = Math.max(0, Math.min(1000, Math.round((governance.serviceAccessPermille + governance.contributionFairnessPermille + community.emergent['community.emergent.socialTrust'] + (1000 - community.emergent['community.emergent.conflict'])) / 4)))
  governance.lastUpdatedTick = tick
}
