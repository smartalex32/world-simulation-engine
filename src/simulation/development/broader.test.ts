import { describe, expect, it } from 'vitest'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { accumulateBroaderExposure, applyBroaderDevelopment, BROADER_DEVELOPMENT_WINDOW_TICKS, completeBroaderExposure, createBroaderDevelopmentState } from './broader'

describe('broader development', () => {
  it('records only explicit encounter/activity/community evidence in a bounded window', () => {
    const initial = createBroaderDevelopmentState(1).exposures.find((value) => value.channelId === 'exposure.peer.relationship-modeling' && value.targetId === PERSON_VARIABLE_ID.trustPropensity)!
    const accumulated = accumulateBroaderExposure({ accumulator: initial, tick: 12, sourceValuePermille: 800, sourcePersonId: 'person-b' })
    expect(accumulated).toMatchObject({ recipientHours: 1, sourceHours: 1, weightedSourceValueHours: 800, sourcePersonIds: ['person-b'] })
    const completed = completeBroaderExposure(accumulated, BROADER_DEVELOPMENT_WINDOW_TICKS + 1)
    expect(completed.experience).toEqual({ sourceMeanPermille: 800, exposureStrengthPermille: 1 })
    expect(completed.accumulator).toMatchObject({ windowStartTick: 721, sourceHours: 0, sourcePersonIds: [] })
  })

  it('uses an explainable bounded fixed-point developmental pull', () => {
    const result = applyBroaderDevelopment({ currentValuePermille: 300, ageYears: 15, sourceValuePermille: 900, exposureStrengthPermille: 600, edgeId: 'development.peer-to-trust', basePlasticityPermille: 12 })
    expect(result).toMatchObject({ gapPermille: 600, ageBand: 'adolescence' })
    expect(result.currentValuePermille).toBeGreaterThan(300)
    expect(result.currentValuePermille).toBeLessThanOrEqual(1000)
  })
})
