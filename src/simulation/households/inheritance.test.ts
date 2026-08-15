import { describe, expect, it } from 'vitest'
import { calculateCuriosityInheritance } from './inheritance'

describe('curiosity inheritance', () => {
  it('uses the exact fictional parental-baseline-variation formula and keeps a complete trace', () => {
    const result = calculateCuriosityInheritance({
      parentIds: ['person-0051', 'person-0001'],
      parentValuesPermille: [800, 600],
      randomVariationPermille: 250,
    })
    // round(((700 * 500) + (500 * 300) + (250 * 200)) / 1000) = 550
    expect(result.valuePermille).toBe(550)
    expect(result.trace).toMatchObject({
      parentIds: ['person-0001', 'person-0051'], parentalMeanPermille: 700,
      populationBaselinePermille: 500, randomVariationPermille: 250,
      parentalWeightPermille: 500, baselineWeightPermille: 300, variationWeightPermille: 200, finalValue: 550,
    })
  })

  it('rejects a duplicate parent and normalizes trace parent IDs into canonical order', () => {
    expect(() => calculateCuriosityInheritance({
      parentIds: ['person-0001', 'person-0001'], parentValuesPermille: [500, 500], randomVariationPermille: 500,
    })).toThrow('two distinct parent IDs')
  })

  it('has a higher repeated-sample tendency for higher parental values with equivalent variation', () => {
    const variations = Array.from({ length: 101 }, (_, index) => index * 10)
    const lowTotal = variations.reduce((total, variation) => total + calculateCuriosityInheritance({
      parentIds: ['a', 'b'], parentValuesPermille: [100, 100], randomVariationPermille: variation,
    }).valuePermille, 0)
    const highTotal = variations.reduce((total, variation) => total + calculateCuriosityInheritance({
      parentIds: ['a', 'b'], parentValuesPermille: [900, 900], randomVariationPermille: variation,
    }).valuePermille, 0)
    expect(highTotal).toBeGreaterThan(lowTotal)
  })
})
