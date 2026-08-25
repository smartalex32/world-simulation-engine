import type { CommunitySimulationState } from '../simulation/community/types'
import type { PersonState } from '../simulation/domain/types'
import type { ProjectedCollectiveKnowledge } from './types'

/**
 * Read-only geographic observation of person-owned knowledge and techniques.
 * It does not create a technology level, shared tool ownership, or diffusion.
 */
export function buildProjectedCollectiveKnowledge(communities: readonly CommunitySimulationState[], people: readonly PersonState[]): ProjectedCollectiveKnowledge[] {
  return [...communities].sort((first, second) => first.catchment.id.localeCompare(second.catchment.id)).map((community) => {
    const cells = new Set(community.catchment.cellIds)
    const residents = people.filter((person) => person.lifeStatus !== 'dead' && cells.has(person.homeCellId))
    const average = (value: (person: PersonState) => number): number => residents.length === 0 ? 0 : Math.round(residents.reduce((sum, person) => sum + value(person), 0) / residents.length)
    const techniques = residents.flatMap((person) => person.techniques ?? [])
    return {
      communityId: community.catchment.id,
      catchmentName: community.catchment.displayName,
      observedResidentCount: residents.length,
      averageForagingKnowledge: average((person) => person.knowledge?.['knowledge.foraging'] ?? 0),
      averageTerrainKnowledge: average((person) => person.knowledge?.['knowledge.localTerrain'] ?? 0),
      practicalTechniqueCount: techniques.length,
      practicalInventorCount: new Set(techniques.map((technique) => technique.personId)).size,
      latestTechniqueTick: techniques.length === 0 ? undefined : Math.max(...techniques.map((technique) => technique.createdTick)),
      technologyLevelStatus: 'not-modeled', sharedToolOwnershipStatus: 'not-inferred', automaticDiffusionStatus: 'not-modeled',
    }
  })
}
