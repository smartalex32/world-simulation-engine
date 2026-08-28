import { PERSON_VARIABLE_DEFINITIONS, getPersonVariableDefinition } from './registry'
import { PERSON_VARIABLE_IDS, type PersonVariableDefinition, type PersonVariableId, type PersonVariableValues } from './types'
import { compareStableText } from '../../shared/stableOrder'

const personVariableIdSet: ReadonlySet<string> = new Set(PERSON_VARIABLE_IDS)

export interface PersonVariableRegistry {
  readonly definitions: readonly PersonVariableDefinition[]
  readonly byId: ReadonlyMap<string, PersonVariableDefinition>
}

export function createPersonVariableRegistry(definitions: readonly PersonVariableDefinition[] = PERSON_VARIABLE_DEFINITIONS): PersonVariableRegistry {
  const ordered = Object.freeze([...definitions].sort((left, right) => left.order - right.order || compareStableText(left.id, right.id)))
  const byId = new Map<string, PersonVariableDefinition>()
  for (const definition of ordered) {
    if (byId.has(definition.id)) throw new Error(`Duplicate person variable ID: ${definition.id}`)
    byId.set(definition.id, definition)
  }
  return Object.freeze({ definitions: ordered, byId })
}

const defaultRegistry = createPersonVariableRegistry()

export function isPersonVariableId(value: string): value is PersonVariableId {
  return personVariableIdSet.has(value)
}

export function createDefaultPersonVariableValues(overrides: Partial<PersonVariableValues> = {}, registry: PersonVariableRegistry = defaultRegistry): PersonVariableValues {
  for (const key of Object.keys(overrides)) {
    if (!registry.byId.has(key)) throw new Error(`Unknown person variable ID: ${key}`)
  }
  const values = Object.fromEntries(registry.definitions.map((definition) => [definition.id, definition.defaultValue])) as PersonVariableValues
  for (const { id } of registry.definitions) {
    const override = overrides[id]
    if (override !== undefined) {
      assertLegalValue(id, override, registry)
      values[id] = override
    }
  }
  return values
}

export function getPersonVariable(values: PersonVariableValues, id: PersonVariableId): number {
  const value = values[id]
  if (value === undefined) throw new Error(`Missing person variable value: ${id}`)
  return value
}

export function setPersonVariable(values: PersonVariableValues, id: PersonVariableId, value: number, registry: PersonVariableRegistry = defaultRegistry): number {
  assertInteger(value, id)
  const definition = registry.byId.get(id)
  if (!definition) throw new Error(`Unknown person variable ID: ${id}`)
  const clamped = Math.max(definition.minimum, Math.min(definition.maximum, value))
  values[id] = clamped
  return clamped
}

export function adjustPersonVariable(values: PersonVariableValues, id: PersonVariableId, delta: number, registry: PersonVariableRegistry = defaultRegistry): number {
  assertInteger(delta, id)
  const current = values[id]
  assertLegalValue(id, current, registry)
  return setPersonVariable(values, id, current + delta, registry)
}

export function validatePersonVariableValues(value: unknown, registry: PersonVariableRegistry = defaultRegistry): asserts value is PersonVariableValues {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Person variable values must be an object')
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  for (const key of keys) {
    if (!registry.byId.has(key)) throw new Error(`Unknown person variable ID: ${key}`)
  }
  for (const { id } of registry.definitions) {
    if (!Object.prototype.hasOwnProperty.call(record, id)) throw new Error(`Missing person variable value: ${id}`)
    assertLegalValue(id, record[id], registry)
  }
  if (keys.length !== registry.definitions.length) throw new Error('Person variable values contain duplicate or unexpected entries')
}

function assertLegalValue(id: PersonVariableId, value: unknown, registry: PersonVariableRegistry): asserts value is number {
  assertInteger(value, id)
  const definition = registry.byId.get(id)
  if (!definition) throw new Error(`Unknown person variable ID: ${id}`)
  if (value < definition.minimum || value > definition.maximum) {
    throw new RangeError(`${id} must be between ${definition.minimum} and ${definition.maximum}`)
  }
}

function assertInteger(value: unknown, id: PersonVariableId): asserts value is number {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${id} must be a safe integer`)
}
