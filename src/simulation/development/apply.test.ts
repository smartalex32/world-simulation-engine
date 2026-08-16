import { describe, expect, it } from 'vitest'
import { PARENT_CURIOSITY_EXPOSURE_CHANNEL, PARENT_CURIOSITY_EXPERIENCE_TYPE, type ParentCuriosityModelingExperience } from '../exposure/model'
import { applyParentCuriosityDevelopment, symmetricRound, symmetricRoundDivision } from './apply'
import { DEVELOPMENT_PARENT_CURIOSITY_EDGE_ID, getDevelopmentAgeBand, getDevelopmentPlasticity } from './model'

function experience(sourceMeanPermille: number, exposureStrengthPermille: number): ParentCuriosityModelingExperience {
  return { type: PARENT_CURIOSITY_EXPERIENCE_TYPE, channelId: PARENT_CURIOSITY_EXPOSURE_CHANNEL, recipientId: 'child-a', sourcePersonIds: ['parent-a'], windowStartTick: 0, windowEndTick: 719, recipientHours: 720, sourceHours: 720, sourceMeanPermille, exposureStrengthPermille }
}

describe('parent curiosity development', () => {
  it('uses the specified age bands and declining plasticity', () => {
    expect([0, 12, 13, 17, 18, 64, 65].map(getDevelopmentAgeBand)).toEqual(['childhood', 'childhood', 'adolescence', 'adolescence', 'adult', 'adult', 'lateLife'])
    expect([0, 13, 18, 65].map((age) => getDevelopmentPlasticity(age).curiosityPlasticityPermillePerMonth)).toEqual([30, 15, 3, 1])
  })

  it('applies the exact explainable childhood developmental delta', () => {
    const result = applyParentCuriosityDevelopment({ currentCuriosityPermille: 400, ageYears: 10, experience: experience(900, 1000) })
    expect(result).toEqual({
      currentValuePermille: 415,
      trace: { edgeId: DEVELOPMENT_PARENT_CURIOSITY_EDGE_ID, previousValuePermille: 400, sourceValuePermille: 900, gapPermille: 500, exposureStrengthPermille: 1000, ageBand: 'childhood', plasticityPermille: 30, applicationProbabilityPermille: 1000, requestedDeltaPermille: 15, appliedDeltaPermille: 15, currentValuePermille: 415 },
    })
  })

  it('rounds positive and negative halves symmetrically', () => {
    expect(symmetricRound(0.5)).toBe(1)
    expect(symmetricRound(-0.5)).toBe(-1)
    expect(symmetricRoundDivision(500_000, 1_000_000)).toBe(1)
    expect(symmetricRoundDivision(-500_000, 1_000_000)).toBe(-1)
  })

  it('makes no change for zero exposure and remains within permille bounds at endpoints', () => {
    expect(applyParentCuriosityDevelopment({ currentCuriosityPermille: 500, ageYears: 10, experience: experience(1000, 0) }).currentValuePermille).toBe(500)
    expect(applyParentCuriosityDevelopment({ currentCuriosityPermille: 0, ageYears: 0, experience: experience(1000, 1000) }).currentValuePermille).toBeGreaterThanOrEqual(0)
    expect(applyParentCuriosityDevelopment({ currentCuriosityPermille: 1000, ageYears: 65, experience: experience(0, 1000) }).currentValuePermille).toBeLessThanOrEqual(1000)
  })
})
