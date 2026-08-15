import type { ParentCuriosityModelingExperience } from '../exposure/model'
import { DEVELOPMENT_PARENT_CURIOSITY_EDGE_ID, getDevelopmentPlasticity, type DevelopmentAgeBand } from './model'

export interface ParentCuriosityDevelopmentInput {
  readonly currentCuriosityPermille: number
  readonly ageYears: number
  readonly experience: ParentCuriosityModelingExperience
}

export interface ParentCuriosityDevelopmentTrace {
  readonly edgeId: typeof DEVELOPMENT_PARENT_CURIOSITY_EDGE_ID
  readonly previousValuePermille: number
  readonly sourceValuePermille: number
  readonly gapPermille: number
  readonly exposureStrengthPermille: number
  readonly ageBand: DevelopmentAgeBand
  readonly plasticityPermille: number
  readonly applicationProbabilityPermille: 1000
  readonly requestedDeltaPermille: number
  readonly appliedDeltaPermille: number
  readonly currentValuePermille: number
}

export interface ParentCuriosityDevelopmentResult {
  readonly currentValuePermille: number
  readonly trace: ParentCuriosityDevelopmentTrace
}

/** Applies one explainable monthly developmental effect; deliberately no RNG. */
export function applyParentCuriosityDevelopment(input: ParentCuriosityDevelopmentInput): ParentCuriosityDevelopmentResult {
  const { currentCuriosityPermille, ageYears, experience } = input
  assertPermille(currentCuriosityPermille, 'currentCuriosityPermille')
  assertPermille(experience.sourceMeanPermille, 'experience.sourceMeanPermille')
  assertPermille(experience.exposureStrengthPermille, 'experience.exposureStrengthPermille')
  const plasticity = getDevelopmentPlasticity(ageYears)
  const gapPermille = experience.sourceMeanPermille - currentCuriosityPermille
  const requestedDeltaPermille = symmetricRoundDivision(
    gapPermille * experience.exposureStrengthPermille * plasticity.curiosityPlasticityPermillePerMonth,
    1_000_000,
  )
  const currentValuePermille = clampPermille(currentCuriosityPermille + requestedDeltaPermille)
  const appliedDeltaPermille = currentValuePermille - currentCuriosityPermille
  return { currentValuePermille, trace: { edgeId: DEVELOPMENT_PARENT_CURIOSITY_EDGE_ID, previousValuePermille: currentCuriosityPermille, sourceValuePermille: experience.sourceMeanPermille, gapPermille, exposureStrengthPermille: experience.exposureStrengthPermille, ageBand: plasticity.ageBand, plasticityPermille: plasticity.curiosityPlasticityPermillePerMonth, applicationProbabilityPermille: 1000, requestedDeltaPermille, appliedDeltaPermille, currentValuePermille } }
}

/** Symmetric rounding: +0.5 rounds up and -0.5 rounds down. */
export function symmetricRound(value: number): number {
  if (!Number.isFinite(value)) throw new Error('value must be finite')
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5)
}

/** Exact signed integer division with ties away from zero; avoids float drift. */
export function symmetricRoundDivision(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator)) throw new Error('numerator must be a safe integer')
  if (!Number.isSafeInteger(denominator) || denominator <= 0) throw new Error('denominator must be a positive safe integer')
  return Math.sign(numerator) * Math.floor((Math.abs(numerator) + Math.floor(denominator / 2)) / denominator)
}

function clampPermille(value: number): number { return Math.max(0, Math.min(1000, value)) }
function assertPermille(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000) throw new Error(`${name} must be an integer permille value between 0 and 1000`)
}
