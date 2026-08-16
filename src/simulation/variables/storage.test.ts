import { describe, expect, it } from 'vitest'
import { PERSON_VARIABLE_ID } from './registry'
import {
  adjustPersonVariable,
  createDefaultPersonVariableValues,
  getPersonVariable,
  setPersonVariable,
  validatePersonVariableValues,
} from './storage'

describe('person variable storage', () => {
  it('creates complete independent values with strict overrides and O(1) access', () => {
    const first = createDefaultPersonVariableValues({ [PERSON_VARIABLE_ID.curiosity]: 875 })
    const second = createDefaultPersonVariableValues()
    expect(getPersonVariable(first, PERSON_VARIABLE_ID.curiosity)).toBe(875)
    expect(getPersonVariable(first, PERSON_VARIABLE_ID.hunger)).toBe(0)
    setPersonVariable(first, PERSON_VARIABLE_ID.hunger, 100)
    expect(getPersonVariable(second, PERSON_VARIABLE_ID.hunger)).toBe(0)
    expect(() => createDefaultPersonVariableValues({ unexpected: 1 } as never)).toThrow('Unknown person variable ID')
    expect(() => createDefaultPersonVariableValues({ [PERSON_VARIABLE_ID.curiosity]: 2.5 })).toThrow('safe integer')
  })

  it('clamps setters and adjusters while rejecting fractional input', () => {
    const values = createDefaultPersonVariableValues()
    expect(setPersonVariable(values, PERSON_VARIABLE_ID.fatigue, 1200)).toBe(1000)
    expect(adjustPersonVariable(values, PERSON_VARIABLE_ID.fatigue, -1400)).toBe(0)
    expect(adjustPersonVariable(values, PERSON_VARIABLE_ID.socialConnection, 145)).toBe(145)
    expect(() => setPersonVariable(values, PERSON_VARIABLE_ID.hunger, 1.5)).toThrow('safe integer')
    expect(() => adjustPersonVariable(values, PERSON_VARIABLE_ID.hunger, Number.NaN)).toThrow('safe integer')
  })

  it('strictly rejects missing, extra, fractional, and out-of-range persisted values', () => {
    const valid = createDefaultPersonVariableValues()
    expect(() => validatePersonVariableValues(valid)).not.toThrow()

    const { [PERSON_VARIABLE_ID.persistence]: _missing, ...missing } = valid
    expect(() => validatePersonVariableValues(missing)).toThrow(`Missing person variable value: ${PERSON_VARIABLE_ID.persistence}`)
    expect(() => validatePersonVariableValues({ ...valid, 'person.trait.unknown': 500 })).toThrow('Unknown person variable ID')
    expect(() => validatePersonVariableValues({ ...valid, [PERSON_VARIABLE_ID.hunger]: 1.25 })).toThrow('safe integer')
    expect(() => validatePersonVariableValues({ ...valid, [PERSON_VARIABLE_ID.hunger]: 1001 })).toThrow('between 0 and 1000')
    expect(() => validatePersonVariableValues([])).toThrow('must be an object')
  })
})
