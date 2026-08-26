import { createInfluenceRegistry } from '../simulation/influences/registry'
import type { InfluenceRegistry } from '../simulation/influences/types'
import type { PersonVariableDefinition, PersonVariableId } from '../simulation/variables/types'
import { validateContentPack } from './validate'
import type { ContentPack } from './types'

/** Immutable, validated registries selected at run creation. No module-level
 * mutation is permitted; every derived registry has stable display ordering. */
export interface ContentPackRuntime {
  readonly pack: ContentPack
  readonly variableDefinitions: readonly PersonVariableDefinition[]
  readonly variableById: ReadonlyMap<PersonVariableId, PersonVariableDefinition>
  readonly influences: InfluenceRegistry
}

export function createContentPackRuntime(candidate: ContentPack): ContentPackRuntime {
  const pack = validateContentPack(candidate).pack
  const variableDefinitions = Object.freeze([...pack.personVariables].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)))
  const variableById = new Map<PersonVariableId, PersonVariableDefinition>()
  for (const definition of variableDefinitions) variableById.set(definition.id, definition)
  return Object.freeze({ pack, variableDefinitions, variableById, influences: createInfluenceRegistry(pack.influences, new Set(variableDefinitions.map((definition) => definition.id))) })
}
