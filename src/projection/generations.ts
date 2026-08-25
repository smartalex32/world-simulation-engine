import type { CommunitySimulationState } from '../simulation/community/types'
import type { ParentChildLink, PersonState } from '../simulation/domain/types'
import type { ProjectedGenerationalEvidence } from './types'

/**
 * Bounded observation of retained child-development evidence by home
 * catchment. It neither assigns community membership nor claims completed
 * adult-to-next-generation feedback.
 */
export function buildProjectedGenerationalEvidence(communities: readonly CommunitySimulationState[], people: readonly PersonState[], parentChildLinks: readonly ParentChildLink[]): ProjectedGenerationalEvidence[] {
  const linksByChildId = new Map<string, ParentChildLink[]>()
  for (const link of parentChildLinks) {
    const group = linksByChildId.get(link.childId)
    if (group) group.push(link)
    else linksByChildId.set(link.childId, [link])
  }
  return [...communities].sort((first, second) => first.catchment.id.localeCompare(second.catchment.id)).map((community) => {
    const cells = new Set(community.catchment.cellIds)
    const children = people.filter((person) => person.lifeStatus !== 'dead' && person.ageYears < 18 && cells.has(person.homeCellId))
    return {
      communityId: community.catchment.id,
      catchmentName: community.catchment.displayName,
      observedChildCount: children.length,
      linkedChildCount: children.filter((child) => (linksByChildId.get(child.id)?.length ?? 0) > 0).length,
      inheritanceTraceCount: children.reduce((sum, child) => sum + child.originTraces.length, 0),
      parentModelingExperienceCount: children.filter((child) => child.development.lastExperience !== undefined).length,
      broaderDevelopmentExperienceCount: children.filter((child) => child.development.broader?.lastExperience !== undefined).length,
      recordedDevelopmentChangeCount: children.filter((child) => child.development.lastChange !== undefined || child.development.broader?.lastChange !== undefined).length,
      householdAndExposureStatus: 'observed-records-only',
      adultFeedbackStatus: 'not-modeled',
      nextGenerationSocietyFeedbackStatus: 'not-modeled',
    }
  })
}
