import { PERSON_VARIABLE_IDS, type PersonVariableDefinition, type PersonVariableId } from './types'

export const PERSON_VARIABLE_ID = Object.freeze({
  curiosity: 'person.trait.curiosity',
  riskTolerance: 'person.trait.riskTolerance',
  sociability: 'person.trait.sociability',
  trustPropensity: 'person.trait.trustPropensity',
  conformity: 'person.trait.conformity',
  persistence: 'person.trait.persistence',
  hunger: 'person.state.hunger',
  fatigue: 'person.state.fatigue',
  socialConnection: 'person.need.socialConnection',
} as const satisfies Record<string, PersonVariableId>)

const definitions = [
  {
    id: PERSON_VARIABLE_ID.curiosity,
    label: 'Curiosity',
    layer: 'trait',
    category: 'cognitive',
    unit: 'permille',
    order: 10,
    minimum: 0,
    maximum: 1000,
    defaultValue: 500,
    initializationMinimum: 0,
    initializationMaximum: 1000,
    enabled: true,
  },
  {
    id: PERSON_VARIABLE_ID.riskTolerance,
    label: 'Risk tolerance',
    layer: 'trait',
    category: 'temperament',
    unit: 'permille',
    order: 20,
    minimum: 0,
    maximum: 1000,
    defaultValue: 500,
    initializationMinimum: 0,
    initializationMaximum: 1000,
    enabled: true,
  },
  {
    id: PERSON_VARIABLE_ID.sociability,
    label: 'Sociability',
    layer: 'trait',
    category: 'social',
    unit: 'permille',
    order: 30,
    minimum: 0,
    maximum: 1000,
    defaultValue: 500,
    initializationMinimum: 0,
    initializationMaximum: 1000,
    enabled: true,
  },
  {
    id: PERSON_VARIABLE_ID.trustPropensity,
    label: 'Trust',
    layer: 'trait',
    category: 'social',
    unit: 'permille',
    order: 40,
    minimum: 0,
    maximum: 1000,
    defaultValue: 500,
    initializationMinimum: 0,
    initializationMaximum: 1000,
    enabled: true,
  },
  {
    id: PERSON_VARIABLE_ID.conformity,
    label: 'Conformity',
    layer: 'trait',
    category: 'social',
    unit: 'permille',
    order: 50,
    minimum: 0,
    maximum: 1000,
    defaultValue: 500,
    initializationMinimum: 0,
    initializationMaximum: 1000,
    enabled: true,
  },
  {
    id: PERSON_VARIABLE_ID.persistence,
    label: 'Persistence',
    layer: 'trait',
    category: 'temperament',
    unit: 'permille',
    order: 60,
    minimum: 0,
    maximum: 1000,
    defaultValue: 500,
    initializationMinimum: 0,
    initializationMaximum: 1000,
    enabled: true,
  },
  {
    id: PERSON_VARIABLE_ID.hunger,
    label: 'Hunger',
    layer: 'state',
    category: 'physical',
    unit: 'permille',
    order: 70,
    minimum: 0,
    maximum: 1000,
    defaultValue: 0,
    initializationMinimum: 0,
    initializationMaximum: 300,
    enabled: true,
  },
  {
    id: PERSON_VARIABLE_ID.fatigue,
    label: 'Fatigue',
    layer: 'state',
    category: 'physical',
    unit: 'permille',
    order: 80,
    minimum: 0,
    maximum: 1000,
    defaultValue: 0,
    initializationMinimum: 0,
    initializationMaximum: 300,
    enabled: true,
  },
  {
    id: PERSON_VARIABLE_ID.socialConnection,
    label: 'Social need',
    layer: 'need',
    category: 'social',
    unit: 'permille',
    order: 90,
    minimum: 0,
    maximum: 1000,
    defaultValue: 0,
    initializationMinimum: 0,
    initializationMaximum: 300,
    enabled: true,
  },
] as const satisfies readonly PersonVariableDefinition[]

export const PERSON_VARIABLE_DEFINITIONS: readonly PersonVariableDefinition[] = Object.freeze(
  definitions.map((definition) => Object.freeze({ ...definition })),
)

const definitionById = new Map<PersonVariableId, PersonVariableDefinition>()
for (const definition of PERSON_VARIABLE_DEFINITIONS) {
  if (definitionById.has(definition.id)) throw new Error(`Duplicate person variable definition: ${definition.id}`)
  definitionById.set(definition.id, definition)
}
if (definitionById.size !== PERSON_VARIABLE_IDS.length) throw new Error('Person variable registry does not define every variable ID')

export function getPersonVariableDefinition(id: PersonVariableId): PersonVariableDefinition {
  const definition = definitionById.get(id)
  if (!definition) throw new Error(`Unknown person variable definition: ${id}`)
  return definition
}
