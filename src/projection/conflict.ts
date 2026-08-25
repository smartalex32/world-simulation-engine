import type { DisputeState } from '../simulation/domain/types'
import type { ProjectedCommunityState, ProjectedContentionProfile } from './types'

/**
 * Read-only contention evidence from recorded interpersonal disputes. This is
 * not a military, diplomacy, occupation, or warfare model.
 */
export function buildProjectedContentionProfiles(communities: readonly ProjectedCommunityState[], disputes: readonly DisputeState[]): ProjectedContentionProfile[] {
  const disputesByCommunity = new Map<string, DisputeState[]>()
  for (const dispute of disputes) {
    const group = disputesByCommunity.get(dispute.communityId)
    if (group) group.push(dispute)
    else disputesByCommunity.set(dispute.communityId, [dispute])
  }
  return [...communities].sort((first, second) => first.catchment.id.localeCompare(second.catchment.id)).map((community) => {
    const group = (disputesByCommunity.get(community.catchment.id) ?? []).sort((first, second) => first.id.localeCompare(second.id))
    const active = group.filter((dispute) => dispute.grievance >= 240)
    const averageGrievance = active.length === 0 ? 0 : Math.round(active.reduce((sum, dispute) => sum + dispute.grievance, 0) / active.length)
    return {
      communityId: community.catchment.id,
      catchmentName: community.catchment.displayName,
      recordedDisputeCount: group.length,
      activeContentionCount: active.length,
      averageActiveGrievancePermille: averageGrievance,
      totalIncidentCount: group.reduce((sum, dispute) => sum + dispute.incidents, 0),
      latestIncidentTick: group.length === 0 ? undefined : Math.max(...group.map((dispute) => dispute.lastIncidentTick)),
      severity: averageGrievance >= 700 ? 'high' : averageGrievance >= 400 ? 'elevated' : active.length > 0 ? 'low' : 'none',
      resolutionScope: active.length > 0 ? 'local-non-lethal-contention' : 'none',
      diplomacyStatus: 'not-modeled', militaryOrganizationStatus: 'not-modeled', occupationStatus: 'not-modeled', warfareStatus: 'not-modeled',
    }
  })
}
