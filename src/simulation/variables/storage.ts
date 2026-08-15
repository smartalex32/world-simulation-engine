import { getPersonVariableDefinition } from './registry'
import { PERSON_VARIABLE_IDS, type PersonVariableId, type PersonVariableValues } from './types'

const personVariableIdSet: ReadonlySet<string> = new Set(PERSON_VARIABLE_IDS)

export function isPersonVariableId(value: string): value is PersonVariableId {
  return personVariableIdSet.has(value)
}

export function createDefaultPersonVariableValues(overrides: Partial<PersonVariableValues> = {}): PersonVariableValues {
  for (const key of Object.keys(overrides)) {
    if (!isPersonVariableId(key)) throw new Error(`Unknown person variable ID: ${key}`)
  }
  const values = Object.fromEntries(PERSON_VARIABLE_IDS.map((id) => [id, getPersonVariableDefinition(id).defaultValue])) as PersonVariableValues
  for (const id of PERSON_VARIABLE_IDS) {
    const override = overrides[id]
    if (override !== undefined) {
      assertLegalValue(id, override)
      values[id] = override
    }
  }
  return values
}

export function getPersonVariable(values: PersonVariableValues, id: PersonVariableId): number {
  return values[id]
}

export function setPersonVariable(values: PersonVariableValues, id: PersonVariableId, value: number): number {
  assertInteger(value, id)
  const definition = getPersonVariableDefinition(id)
  const clamped = Math.max(definition.minimum, Math.min(definition.maximum, value))
  values[id] = clamped
  return clamped
}

export function adjustPersonVariable(values: PersonVariableValues, id: PersonVariableId, delta: number): number {
  assertInteger(delta, id)
  const current = values[id]
  assertLegalValue(id, current)
  return setPersonVariable(values, id, current + delta)
}

export function validatePersonVariableValues(value: unknown): asserts value is PersonVariableValues {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Person variable values must be an object')
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  for (const key of keys) {
    if (!isPersonVariableId(key)) throw new Error(`Unknown person variable ID: ${key}`)
  }
  for (const id of PERSON_VARIABLE_IDS) {
    if (!Object.prototype.hasOwnProperty.call(record, id)) throw new Error(`Missing person variable value: ${id}`)
    assertLegalValue(id, record[id])
  }
  if (keys.length !== PERSON_VARIABLE_IDS.length) throw new Error('Person variable values contain duplicate or unexpected entries')
}

function assertLegalValue(id: PersonVariableId, value: unknown): asserts value is number {
  assertInteger(value, id)
  const definition = getPersonVariableDefinition(id)
  if (value < definition.minimum || value > definition.maximum) {
    throw new RangeError(`${id} must be between ${definition.minimum} and ${definition.maximum}`)
  }
}

function assertInteger(value: unknown, id: PersonVariableId): asserts value is number {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${id} must be a safe integer`)
}
