export const DEVELOPMENT_PARENT_CURIOSITY_EDGE_ID = 'development.parent-curiosity-to-curiosity' as const

export type DevelopmentAgeBand = 'childhood' | 'adolescence' | 'adult' | 'lateLife'

export interface DevelopmentPlasticityDefinition {
  readonly ageBand: DevelopmentAgeBand
  readonly minimumAgeYears: number
  readonly maximumAgeYears?: number
  readonly curiosityPlasticityPermillePerMonth: number
}

export const DEVELOPMENT_PLASTICITY_REGISTRY: readonly DevelopmentPlasticityDefinition[] = Object.freeze([
  { ageBand: 'childhood', minimumAgeYears: 0, maximumAgeYears: 12, curiosityPlasticityPermillePerMonth: 30 },
  { ageBand: 'adolescence', minimumAgeYears: 13, maximumAgeYears: 17, curiosityPlasticityPermillePerMonth: 15 },
  { ageBand: 'adult', minimumAgeYears: 18, maximumAgeYears: 64, curiosityPlasticityPermillePerMonth: 3 },
  { ageBand: 'lateLife', minimumAgeYears: 65, curiosityPlasticityPermillePerMonth: 1 },
])

export function getDevelopmentAgeBand(ageYears: number): DevelopmentAgeBand {
  return getDevelopmentPlasticity(ageYears).ageBand
}

export function getDevelopmentPlasticity(ageYears: number): DevelopmentPlasticityDefinition {
  if (!Number.isSafeInteger(ageYears) || ageYears < 0) throw new Error('ageYears must be a non-negative safe integer')
  const definition = DEVELOPMENT_PLASTICITY_REGISTRY.find(({ minimumAgeYears, maximumAgeYears }) => ageYears >= minimumAgeYears && (maximumAgeYears === undefined || ageYears <= maximumAgeYears))
  if (!definition) throw new Error(`No development plasticity definition for age ${ageYears}`)
  return definition
}
