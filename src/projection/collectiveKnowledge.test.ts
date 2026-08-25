import { describe, expect, it } from 'vitest'
import { buildProjectedCollectiveKnowledge } from './collectiveKnowledge'

describe('collective knowledge projection', () => {
  it('observes person-owned knowledge and techniques by home catchment without inventing a technology level', () => {
    const profiles = buildProjectedCollectiveKnowledge([{ catchment: { id: 'west', displayName: 'West Valley', anchorCellId: '0,0', cellIds: ['0,0'] } }] as never, [
      { id: 'a', lifeStatus: 'alive', homeCellId: '0,0', knowledge: { 'knowledge.foraging': 800, 'knowledge.localTerrain': 200 }, techniques: [{ id: 'technique.foraging.efficient-harvest', personId: 'a', createdTick: 24, knowledgePermille: 800, toolCost: 1, successRollPermille: 1 }] },
      { id: 'b', lifeStatus: 'alive', homeCellId: '0,0', knowledge: { 'knowledge.foraging': 400, 'knowledge.localTerrain': 600 } },
    ] as never)
    expect(profiles).toEqual([{
      communityId: 'west', catchmentName: 'West Valley', observedResidentCount: 2, averageForagingKnowledge: 600, averageTerrainKnowledge: 400, practicalTechniqueCount: 1, practicalInventorCount: 1, latestTechniqueTick: 24,
      technologyLevelStatus: 'not-modeled', sharedToolOwnershipStatus: 'not-inferred', automaticDiffusionStatus: 'not-modeled',
    }])
  })
})
