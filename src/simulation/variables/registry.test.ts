import { describe, expect, it } from 'vitest'
import { getPersonVariableDefinition, PERSON_VARIABLE_DEFINITIONS, PERSON_VARIABLE_ID } from './registry'
import { PERSON_VARIABLE_IDS } from './types'

describe('person variable registry', () => {
  it('defines the exact ten IDs in deterministic display order', () => {
    expect(PERSON_VARIABLE_IDS).toEqual([
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
    ])
    expect(PERSON_VARIABLE_DEFINITIONS.map((definition) => definition.id)).toEqual(PERSON_VARIABLE_IDS)
    expect(PERSON_VARIABLE_DEFINITIONS.map((definition) => definition.order)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 85, 90])
    expect(new Set(PERSON_VARIABLE_DEFINITIONS.map((definition) => definition.id)).size).toBe(10)
  })

  it('keeps hunger and fatigue as states and social connection as a need', () => {
    expect(getPersonVariableDefinition(PERSON_VARIABLE_ID.hunger)).toMatchObject({ layer: 'state', category: 'physical' })
    expect(getPersonVariableDefinition(PERSON_VARIABLE_ID.fatigue)).toMatchObject({ layer: 'state', category: 'physical' })
    expect(getPersonVariableDefinition(PERSON_VARIABLE_ID.healthStress)).toMatchObject({ layer: 'state', category: 'physical' })
    expect(getPersonVariableDefinition(PERSON_VARIABLE_ID.socialConnection)).toMatchObject({ layer: 'need', category: 'social' })
  })

  it('keeps definition, initialization, and default bounds legal', () => {
    for (const definition of PERSON_VARIABLE_DEFINITIONS) {
      expect(definition.minimum).toBe(0)
      expect(definition.maximum).toBe(1000)
      expect(definition.unit).toBe('permille')
      expect(definition.defaultValue).toBeGreaterThanOrEqual(definition.minimum)
      expect(definition.defaultValue).toBeLessThanOrEqual(definition.maximum)
      expect(definition.initializationMinimum).toBeGreaterThanOrEqual(definition.minimum)
      expect(definition.initializationMaximum).toBeLessThanOrEqual(definition.maximum)
      expect(definition.initializationMinimum).toBeLessThanOrEqual(definition.initializationMaximum)
      expect(definition.enabled).toBe(true)
    }
  })
})
