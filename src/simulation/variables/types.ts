export const PERSON_VARIABLE_IDS = Object.freeze([
  'person.trait.curiosity',
  'person.trait.riskTolerance',
  'person.trait.sociability',
  'person.trait.trustPropensity',
  'person.trait.conformity',
  'person.trait.persistence',
  'person.state.hunger',
  'person.state.fatigue',
  'person.need.socialConnection',
] as const)

export type PersonVariableId = typeof PERSON_VARIABLE_IDS[number]
export type PersonVariableLayer = 'trait' | 'state' | 'need'
export type PersonVariableCategory = 'cognitive' | 'temperament' | 'social' | 'physical'
export type PersonVariableValues = Record<PersonVariableId, number>

export interface PersonVariableDefinition {
  id: PersonVariableId
  label: string
  layer: PersonVariableLayer
  category: PersonVariableCategory
  unit: 'permille'
  order: number
  minimum: 0
  maximum: 1000
  defaultValue: number
  initializationMinimum: number
  initializationMaximum: number
  enabled: boolean
}
