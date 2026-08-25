import type { CommunitySimulationState } from '../community/types'
import type { LocalGovernanceState, PersonState } from '../domain/types'

export interface LegitimacyEvaluationInput { serviceAccessPermille: number; contributionFairnessPermille: number; socialTrustPermille: number; conflictPermille: number }
export interface LegitimacyEvaluation { serviceAccessPermille: number; contributionFairnessPermille: number; socialTrustPermille: number; conflictAbsencePermille: number; legitimacyPermille: number }

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
  governance.legitimacy = evaluateLegitimacy({ serviceAccessPermille: governance.serviceAccessPermille, contributionFairnessPermille: governance.contributionFairnessPermille, socialTrustPermille: community.emergent['community.emergent.socialTrust'], conflictPermille: community.emergent['community.emergent.conflict'] }).legitimacyPermille
  governance.lastUpdatedTick = tick
}

/** Pure, bounded civic evidence; it does not model tax collection, law, or a public budget. */
export function evaluateLegitimacy(input: LegitimacyEvaluationInput): LegitimacyEvaluation {
  const serviceAccessPermille = clampPermille(input.serviceAccessPermille)
  const contributionFairnessPermille = clampPermille(input.contributionFairnessPermille)
  const socialTrustPermille = clampPermille(input.socialTrustPermille)
  const conflictAbsencePermille = 1000 - clampPermille(input.conflictPermille)
  return { serviceAccessPermille, contributionFairnessPermille, socialTrustPermille, conflictAbsencePermille, legitimacyPermille: Math.round((serviceAccessPermille + contributionFairnessPermille + socialTrustPermille + conflictAbsencePermille) / 4) }
}

function clampPermille(value: number): number { return Math.max(0, Math.min(1000, Math.round(value))) }
