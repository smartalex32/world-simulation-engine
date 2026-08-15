import type { CuriosityInheritanceTrace } from '../domain/types'

export const CURIOSITY_INHERITANCE_MODEL = {
  id: 'inheritance.parental-baseline-variation.v1',
  targetId: 'person.trait.curiosity',
  populationBaselinePermille: 500,
  parentalWeightPermille: 500,
  baselineWeightPermille: 300,
  variationWeightPermille: 200,
  minimumPermille: 0,
  maximumPermille: 1000,
} as const

export interface CuriosityInheritanceInput {
  readonly parentIds: readonly [string, string]
  readonly parentValuesPermille: readonly [number, number]
  /** A uniform, named-RNG draw in inclusive integer permille (0–1000). */
  readonly randomVariationPermille: number
}

export interface CuriosityInheritanceResult {
  readonly valuePermille: number
  readonly trace: CuriosityInheritanceTrace
}

/**
 * A fictional starting-predisposition model, not a biological claim. The exact
 * rounded formula is `(parentalMean * 500 + 500 * 300 + variation * 200) / 1000`.
 */
export function calculateCuriosityInheritance(input: CuriosityInheritanceInput): CuriosityInheritanceResult {
  const [parentA, parentB] = input.parentValuesPermille
  if (input.parentIds[0] === input.parentIds[1]) throw new RangeError('Curiosity inheritance requires two distinct parent IDs')
  validatePermille(parentA, 'Parent A curiosity')
  validatePermille(parentB, 'Parent B curiosity')
  validatePermille(input.randomVariationPermille, 'Random variation')

  const parentalMeanPermille = Math.round((parentA + parentB) / 2)
  const numerator = parentalMeanPermille * CURIOSITY_INHERITANCE_MODEL.parentalWeightPermille
    + CURIOSITY_INHERITANCE_MODEL.populationBaselinePermille * CURIOSITY_INHERITANCE_MODEL.baselineWeightPermille
    + input.randomVariationPermille * CURIOSITY_INHERITANCE_MODEL.variationWeightPermille
  const valuePermille = clampPermille(Math.round(numerator / 1000))
  return {
    valuePermille,
    trace: {
      modelId: CURIOSITY_INHERITANCE_MODEL.id,
      targetId: CURIOSITY_INHERITANCE_MODEL.targetId,
      parentIds: [...input.parentIds].sort(compareText),
      parentalMeanPermille,
      populationBaselinePermille: CURIOSITY_INHERITANCE_MODEL.populationBaselinePermille,
      randomVariationPermille: input.randomVariationPermille,
      parentalWeightPermille: CURIOSITY_INHERITANCE_MODEL.parentalWeightPermille,
      baselineWeightPermille: CURIOSITY_INHERITANCE_MODEL.baselineWeightPermille,
      variationWeightPermille: CURIOSITY_INHERITANCE_MODEL.variationWeightPermille,
      finalValue: valuePermille,
    },
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function validatePermille(value: number, label: string): void {
  if (!Number.isInteger(value) || value < CURIOSITY_INHERITANCE_MODEL.minimumPermille || value > CURIOSITY_INHERITANCE_MODEL.maximumPermille) {
    throw new RangeError(`${label} must be an integer from 0 through 1000`)
  }
}

function clampPermille(value: number): number {
  return Math.max(CURIOSITY_INHERITANCE_MODEL.minimumPermille, Math.min(CURIOSITY_INHERITANCE_MODEL.maximumPermille, value))
}
