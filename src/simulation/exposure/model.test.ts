import { describe, expect, it } from 'vitest'
import {
  accumulateParentCuriosityExposure,
  completeParentCuriosityExposureWindow,
  createParentCuriosityExposureAccumulator,
  PARENT_CURIOSITY_EXPOSURE_CHANNEL,
  PARENT_CURIOSITY_EXPERIENCE_TYPE,
} from './model'

describe('parent curiosity exposure', () => {
  it('accumulates exact one- and two-parent co-present source hours', () => {
    const first = accumulateParentCuriosityExposure({
      accumulator: createParentCuriosityExposureAccumulator(0), tick: 0,
      coPresentParents: [{ parentId: 'parent-a', curiosityPermille: 600 }],
    })
    const second = accumulateParentCuriosityExposure({
      accumulator: first, tick: 1,
      coPresentParents: [{ parentId: 'parent-a', curiosityPermille: 600 }, { parentId: 'parent-b', curiosityPermille: 800 }],
    })
    expect(second).toMatchObject({ channelId: PARENT_CURIOSITY_EXPOSURE_CHANNEL, recipientHours: 2, sourceHours: 3, weightedSourceValueHours: 2000, sourcePersonIds: ['parent-a', 'parent-b'], lastExposureTick: 1 })
  })

  it('does not accumulate exposure without canonical co-presence', () => {
    const accumulator = accumulateParentCuriosityExposure({ accumulator: createParentCuriosityExposureAccumulator(0), tick: 0, coPresentParents: [] })
    expect(accumulator).toEqual(createParentCuriosityExposureAccumulator(0))
    const completed = completeParentCuriosityExposureWindow(accumulator, 720, 'child-a')
    expect(completed.experience).toBeUndefined()
    expect(completed.accumulator).toEqual(createParentCuriosityExposureAccumulator(720))
  })

  it('creates one exact structured experience at the window boundary and resets', () => {
    const accumulator = accumulateParentCuriosityExposure({
      accumulator: createParentCuriosityExposureAccumulator(0), tick: 19,
      coPresentParents: [{ parentId: 'parent-a', curiosityPermille: 600 }, { parentId: 'parent-b', curiosityPermille: 801 }],
    })
    const completed = completeParentCuriosityExposureWindow(accumulator, 720, 'child-a')
    expect(completed.experience).toEqual({
      type: PARENT_CURIOSITY_EXPERIENCE_TYPE, channelId: PARENT_CURIOSITY_EXPOSURE_CHANNEL, recipientId: 'child-a', sourcePersonIds: ['parent-a', 'parent-b'],
      windowStartTick: 0, windowEndTick: 719, recipientHours: 1, sourceHours: 2, sourceMeanPermille: 701, exposureStrengthPermille: 2,
    })
    expect(completed.accumulator).toEqual(createParentCuriosityExposureAccumulator(720))
  })

  it('rejects duplicate or unstable canonical parent inputs', () => {
    expect(() => accumulateParentCuriosityExposure({
      accumulator: createParentCuriosityExposureAccumulator(0), tick: 0,
      coPresentParents: [{ parentId: 'parent-b', curiosityPermille: 500 }, { parentId: 'parent-a', curiosityPermille: 500 }],
    })).toThrow('strictly ordered')
    expect(() => accumulateParentCuriosityExposure({
      accumulator: createParentCuriosityExposureAccumulator(0), tick: 0,
      coPresentParents: [{ parentId: 'parent-a', curiosityPermille: 500 }, { parentId: 'parent-b', curiosityPermille: 500 }, { parentId: 'parent-c', curiosityPermille: 500 }],
    })).toThrow('At most two')
  })
})
