import { describe, expect, it } from 'vitest'
import { buildProjectedCollectiveCultures } from './collectiveCulture'

describe('collective culture projection', () => {
  it('summarizes person-owned language and beliefs by observed home catchment without assigning identity', () => {
    const profiles = buildProjectedCollectiveCultures([{ catchment: { id: 'west', displayName: 'West Valley', anchorCellId: '0,0', cellIds: ['0,0'] } }] as never, [
      { id: 'a', lifeStatus: 'alive', homeCellId: '0,0', language: { fluency: { 'language.valley': 900, 'language.ridge': 100 }, acquisitionCount: 2 }, culture: { beliefs: { 'belief.exploration': 700, 'belief.cooperation': 600 }, exposureCount: 3 } },
      { id: 'b', lifeStatus: 'alive', homeCellId: '0,0', language: { fluency: { 'language.valley': 500, 'language.ridge': 500 }, acquisitionCount: 1 }, culture: { beliefs: { 'belief.exploration': 300, 'belief.cooperation': 800 }, exposureCount: 5 } },
      { id: 'outside', lifeStatus: 'alive', homeCellId: '1,0' },
    ] as never)
    expect(profiles).toEqual([{
      communityId: 'west', catchmentName: 'West Valley', observedResidentCount: 2, averageValleyFluency: 700, averageRidgeFluency: 300, averageExplorationBelief: 500, averageCooperationBelief: 700, cultureExposureCount: 8, languageAcquisitionCount: 3,
      religionStatus: 'not-modeled', identityStatus: 'not-modeled', polityMembershipStatus: 'separate-not-inferred',
    }])
  })
})
