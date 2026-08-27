export const PERSON_VARIABLE_IDS = Object.freeze([
  'person.trait.curiosity',
  'person.trait.riskTolerance',
  'person.trait.sociability',
  'person.trait.trustPropensity',
  'person.trait.conformity',
  'person.trait.persistence',
  'person.state.hunger',
  'person.state.fatigue',
  'person.state.healthStress',
  'person.need.socialConnection',
] as const)

/** Content packs own the supported variable namespace for a run.  The built-in
 * IDs below remain useful constants, but a pack may define additional stable IDs. */
export type PersonVariableId = string
export type PersonVariableLayer = 'trait' | 'state' | 'need'
export type PersonVariableCategory = 'cognitive' | 'temperament' | 'social' | 'physical'
export type PersonVariableValues = Record<string, number>

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
