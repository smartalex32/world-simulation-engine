import { describe, expect, it } from 'vitest'
import { buildProjectedGenerationalEvidence } from './generations'

describe('generational evidence projection', () => {
  it('summarizes retained child evidence by observed home catchment without inferring future feedback', () => {
    const profiles = buildProjectedGenerationalEvidence([{ catchment: { id: 'west', displayName: 'West Valley', anchorCellId: '0,0', cellIds: ['0,0'] } }] as never, [
      { id: 'child-a', lifeStatus: 'alive', ageYears: 10, homeCellId: '0,0', originTraces: [{}], development: { lastExperience: {}, lastChange: {} } },
      { id: 'child-b', lifeStatus: 'alive', ageYears: 12, homeCellId: '0,0', originTraces: [], development: { broader: { lastExperience: {}, lastChange: {} } } },
      { id: 'adult', lifeStatus: 'alive', ageYears: 20, homeCellId: '0,0', originTraces: [], development: {} },
    ] as never, [{ id: 'link', childId: 'child-a', parentId: 'adult', householdId: 'household' }] as never)
    expect(profiles).toEqual([{
      communityId: 'west', catchmentName: 'West Valley', observedChildCount: 2, linkedChildCount: 1, inheritanceTraceCount: 1, parentModelingExperienceCount: 1, broaderDevelopmentExperienceCount: 1, recordedDevelopmentChangeCount: 2,
      householdAndExposureStatus: 'observed-records-only', adultFeedbackStatus: 'not-modeled', nextGenerationSocietyFeedbackStatus: 'not-modeled',
    }])
  })
})
