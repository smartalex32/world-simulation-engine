import { createInfluenceRegistry } from '../simulation/influences/registry'
import type { InfluenceRegistry } from '../simulation/influences/types'
import type { PersonVariableDefinition, PersonVariableId } from '../simulation/variables/types'
import { createPersonVariableRegistry, type PersonVariableRegistry } from '../simulation/variables/storage'
import { validateContentPack } from './validate'
import type { ContentPack } from './types'

/** Immutable, validated registries selected at run creation. No module-level
 * mutation is permitted; every derived registry has stable display ordering. */
export interface ContentPackRuntime {
  readonly pack: ContentPack
  readonly variableDefinitions: readonly PersonVariableDefinition[]
  readonly variableById: ReadonlyMap<PersonVariableId, PersonVariableDefinition>
  readonly variables: PersonVariableRegistry
  readonly influences: InfluenceRegistry
}

export function createPackVariableValues(runtime: ContentPackRuntime, overrides: Readonly<Record<string, number>> = {}): Record<string, number> {
  const values: Record<string, number> = {}
  for (const definition of runtime.variableDefinitions) {
    const value = overrides[definition.id] ?? definition.defaultValue
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < definition.minimum || value > definition.maximum) throw new Error(`Pack variable value is invalid: ${definition.id}`)
    values[definition.id] = value
  }
  for (const id of Object.keys(overrides)) if (!runtime.variableById.has(id as PersonVariableId)) throw new Error(`Unknown pack variable: ${id}`)
  return values
}

export function validatePackVariableValues(runtime: ContentPackRuntime, values: Readonly<Record<string, unknown>>): void {
  const keys = Object.keys(values)
  if (keys.length !== runtime.variableDefinitions.length) throw new Error('Pack variable values have missing or unexpected entries')
  for (const definition of runtime.variableDefinitions) {
    const value = values[definition.id]
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < definition.minimum || value > definition.maximum) throw new Error(`Pack variable value is invalid: ${definition.id}`)
  }
}

export function createContentPackRuntime(candidate: ContentPack): ContentPackRuntime {
  const pack = validateContentPack(candidate).pack
  const variableDefinitions = Object.freeze([...pack.personVariables].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)))
  const variableById = new Map<PersonVariableId, PersonVariableDefinition>()
  for (const definition of variableDefinitions) variableById.set(definition.id, definition)
  return Object.freeze({ pack, variableDefinitions, variableById, variables: createPersonVariableRegistry(variableDefinitions), influences: createInfluenceRegistry(pack.influences, new Set(variableDefinitions.map((definition) => definition.id))) })
}
