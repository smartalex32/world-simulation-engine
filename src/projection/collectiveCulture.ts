import type { CommunitySimulationState } from '../simulation/community/types'
import type { PersonState } from '../simulation/domain/types'
import type { ProjectedCollectiveCulture } from './types'
import { compareStableText } from '../shared/stableOrder'

/**
 * Geographic observation of person-owned language and learned beliefs. A
 * catchment does not assign a culture, religion, identity, or polity status.
 */
export function buildProjectedCollectiveCultures(communities: readonly CommunitySimulationState[], people: readonly PersonState[]): ProjectedCollectiveCulture[] {
  return [...communities].sort((first, second) => compareStableText(first.catchment.id, second.catchment.id)).map((community) => {
    const cells = new Set(community.catchment.cellIds)
    const residents = people.filter((person) => person.lifeStatus !== 'dead' && cells.has(person.homeCellId))
    const average = (value: (person: PersonState) => number): number => residents.length === 0 ? 0 : Math.round(residents.reduce((sum, person) => sum + value(person), 0) / residents.length)
    return {
      communityId: community.catchment.id,
      catchmentName: community.catchment.displayName,
      observedResidentCount: residents.length,
      averageValleyFluency: average((person) => person.language?.fluency['language.valley'] ?? 0),
      averageRidgeFluency: average((person) => person.language?.fluency['language.ridge'] ?? 0),
      averageExplorationBelief: average((person) => person.culture?.beliefs['belief.exploration'] ?? 0),
      averageCooperationBelief: average((person) => person.culture?.beliefs['belief.cooperation'] ?? 0),
      cultureExposureCount: residents.reduce((sum, person) => sum + (person.culture?.exposureCount ?? 0), 0),
      languageAcquisitionCount: residents.reduce((sum, person) => sum + (person.language?.acquisitionCount ?? 0), 0),
      religionStatus: 'not-modeled', identityStatus: 'not-modeled', polityMembershipStatus: 'separate-not-inferred',
    }
  })
}
