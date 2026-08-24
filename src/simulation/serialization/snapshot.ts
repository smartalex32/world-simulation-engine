import {
  ACTIVITY_REGISTRY_VERSION,
  COMMUNITY_REGISTRY_VERSION,
  DEVELOPMENT_REGISTRY_VERSION,
  ENVIRONMENT_MODEL_VERSION,
  LIFE_CYCLE_MODEL_VERSION,
  ECONOMY_MODEL_VERSION,
  ORGANIZATION_MODEL_VERSION,
  CULTURE_MODEL_VERSION,
  LANGUAGE_MODEL_VERSION,
  GOVERNANCE_MODEL_VERSION,
  CONFLICT_MODEL_VERSION,
  KNOWLEDGE_MODEL_VERSION,
  HEALTH_MODEL_VERSION,
  INNOVATION_MODEL_VERSION,
  ENGINE_VERSION,
  HOUSEHOLD_MODEL_VERSION,
  INFLUENCE_REGISTRY_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  VARIABLE_REGISTRY_VERSION,
  WORLD_CELL_RADIUS_METERS,
  WORLD_GENERATOR_VERSION,
  type SimulationState,
  type SnapshotEnvelope,
} from '../domain/types'
import { normalizeWorldCreationRequest } from '../domain/worldCreation'
import { HOUSEHOLD_GENERATION_STREAM } from '../households/config'
import { validateHouseholdActivityState } from '../engine/invariants'
import { validatePersonVariableValues } from '../variables/storage'
import { validateCommunitySimulationState } from '../community/invariants'

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, sortValue(entry)]),
    )
  }
  return value
}

export async function stateDigest(state: SimulationState): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStringify(state))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createSnapshot(state: SimulationState): Promise<SnapshotEnvelope> {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    state: structuredClone(state),
    digest: await stateDigest(state),
  }
}

export async function validateSnapshot(value: unknown): Promise<SnapshotEnvelope> {
  if (!value || typeof value !== 'object') throw new Error('Snapshot is not an object')
  const snapshot = value as Partial<SnapshotEnvelope>
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new Error(`Unsupported snapshot schema: ${String(snapshot.schemaVersion)}`)
  if (snapshot.engineVersion !== ENGINE_VERSION) throw new Error(`Unsupported engine version: ${String(snapshot.engineVersion)}`)
  if (!snapshot.state || typeof snapshot.digest !== 'string') throw new Error('Snapshot is missing state or digest')
  if (snapshot.state.config?.baseTickHours !== 1 || !Number.isSafeInteger(snapshot.state.tick) || snapshot.state.tick < 0) {
    throw new Error('Snapshot contains an invalid clock')
  }
  if (snapshot.state.config.variableRegistryVersion !== VARIABLE_REGISTRY_VERSION) {
    throw new Error(`Unsupported variable registry version: ${String(snapshot.state.config.variableRegistryVersion)}`)
  }
  if (snapshot.state.config.influenceRegistryVersion !== INFLUENCE_REGISTRY_VERSION) {
    throw new Error(`Unsupported influence registry version: ${String(snapshot.state.config.influenceRegistryVersion)}`)
  }
  if (snapshot.state.config.householdModelVersion !== HOUSEHOLD_MODEL_VERSION) {
    throw new Error(`Unsupported household model version: ${String(snapshot.state.config.householdModelVersion)}`)
  }
  if (snapshot.state.config.activityRegistryVersion !== ACTIVITY_REGISTRY_VERSION) {
    throw new Error(`Unsupported activity registry version: ${String(snapshot.state.config.activityRegistryVersion)}`)
  }
  if (snapshot.state.config.developmentRegistryVersion !== DEVELOPMENT_REGISTRY_VERSION) {
    throw new Error(`Unsupported development registry version: ${String(snapshot.state.config.developmentRegistryVersion)}`)
  }
  if (snapshot.state.config.communityRegistryVersion !== COMMUNITY_REGISTRY_VERSION) {
    throw new Error(`Unsupported community registry version: ${String(snapshot.state.config.communityRegistryVersion)}`)
  }
  if (snapshot.state.config.environmentModelVersion !== ENVIRONMENT_MODEL_VERSION) {
    throw new Error(`Unsupported environment model version: ${String(snapshot.state.config.environmentModelVersion)}`)
  }
  if (snapshot.state.config.lifeCycleModelVersion !== LIFE_CYCLE_MODEL_VERSION) {
    throw new Error(`Unsupported life-cycle model version: ${String(snapshot.state.config.lifeCycleModelVersion)}`)
  }
  if (snapshot.state.config.economyModelVersion !== ECONOMY_MODEL_VERSION) {
    throw new Error(`Unsupported economy model version: ${String(snapshot.state.config.economyModelVersion)}`)
  }
  if (snapshot.state.config.organizationModelVersion !== ORGANIZATION_MODEL_VERSION) throw new Error(`Unsupported organization model version: ${String(snapshot.state.config.organizationModelVersion)}`)
  if (snapshot.state.config.cultureModelVersion !== CULTURE_MODEL_VERSION) throw new Error(`Unsupported culture model version: ${String(snapshot.state.config.cultureModelVersion)}`)
  if (snapshot.state.config.languageModelVersion !== LANGUAGE_MODEL_VERSION) throw new Error(`Unsupported language model version: ${String(snapshot.state.config.languageModelVersion)}`)
  if (snapshot.state.config.governanceModelVersion !== GOVERNANCE_MODEL_VERSION) throw new Error(`Unsupported governance model version: ${String(snapshot.state.config.governanceModelVersion)}`)
  if (snapshot.state.config.conflictModelVersion !== CONFLICT_MODEL_VERSION) throw new Error(`Unsupported conflict model version: ${String(snapshot.state.config.conflictModelVersion)}`)
  if (snapshot.state.config.knowledgeModelVersion !== KNOWLEDGE_MODEL_VERSION) throw new Error(`Unsupported knowledge model version: ${String(snapshot.state.config.knowledgeModelVersion)}`)
  if (snapshot.state.config.healthModelVersion !== HEALTH_MODEL_VERSION) throw new Error(`Unsupported health model version: ${String(snapshot.state.config.healthModelVersion)}`)
  if (snapshot.state.config.innovationModelVersion !== INNOVATION_MODEL_VERSION) throw new Error(`Unsupported innovation model version: ${String(snapshot.state.config.innovationModelVersion)}`)
  if (snapshot.state.config.worldGeneratorVersion !== WORLD_GENERATOR_VERSION) {
    throw new Error(`Unsupported world generator version: ${String(snapshot.state.config.worldGeneratorVersion)}`)
  }
  if (snapshot.state.config.worldWidth !== snapshot.state.world.grid.width || snapshot.state.config.worldHeight !== snapshot.state.world.grid.height) {
    throw new Error('Snapshot world dimensions do not match configuration')
  }
  if (snapshot.state.world.scale?.layout !== 'axial-pointy' || snapshot.state.world.scale.hexRadiusMeters !== WORLD_CELL_RADIUS_METERS) {
    throw new Error('Snapshot contains an unsupported world scale')
  }
  const normalizedCreation = normalizeWorldCreationRequest(snapshot.state.config.worldCreation, snapshot.state.world.grid.cells, { enforceCreatorLimits: false })
  if (canonicalStringify(normalizedCreation) !== canonicalStringify(snapshot.state.config.worldCreation)) throw new Error('Snapshot contains a non-canonical world creation request')
  if (snapshot.state.world.name !== normalizedCreation.name || canonicalStringify(snapshot.state.world.settlements) !== canonicalStringify(normalizedCreation.settlements) || canonicalStringify(snapshot.state.world.roads ?? []) !== canonicalStringify(normalizedCreation.roads ?? [])) {
    throw new Error('Snapshot world does not match creation request')
  }
  if (!Array.isArray(snapshot.state.people)) throw new Error('Snapshot contains an invalid population')
  for (const person of snapshot.state.people) {
    validatePersonVariableValues(person.variables)
    if (!person.knowledge || Object.keys(person.knowledge).sort().join('|') !== 'knowledge.foraging|knowledge.localTerrain') throw new Error(`Person ${person.id} contains invalid knowledge records`)
    if (Object.values(person.knowledge).some((value) => !Number.isSafeInteger(value) || value < 0 || value > 1000)) throw new Error(`Person ${person.id} contains invalid knowledge values`)
    if (typeof person.schoolLearningHours !== 'number' || !Number.isSafeInteger(person.schoolLearningHours) || person.schoolLearningHours < 0) throw new Error(`Person ${person.id} contains invalid school learning hours`)
  }
  validateHouseholdActivityState(snapshot.state)
  validateCommunitySimulationState(snapshot.state)
  validateRandomStreams(snapshot.state.randomStreams)
  const actual = await stateDigest(snapshot.state)
  if (actual !== snapshot.digest) throw new Error('Snapshot digest does not match its contents')
  return snapshot as SnapshotEnvelope
}

function validateRandomStreams(value: unknown): void {
  if (!Array.isArray(value)) throw new Error('Snapshot contains invalid random streams')
  const names: string[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') throw new Error('Snapshot contains an invalid random stream')
    const stream = entry as { name?: unknown; stateHex?: unknown; incrementHex?: unknown }
    if (typeof stream.name !== 'string' || !/^[0-9a-f]{16}$/i.test(String(stream.stateHex)) || !/^[0-9a-f]{16}$/i.test(String(stream.incrementHex))) {
      throw new Error('Snapshot contains an invalid random stream')
    }
    names.push(stream.name)
  }
  if (!names.every((name, index) => index === 0 || (names[index - 1] as string) < name)) throw new Error('Snapshot random streams are not in canonical order')
  for (const required of Object.values(HOUSEHOLD_GENERATION_STREAM)) {
    if (!names.includes(required)) throw new Error(`Snapshot is missing random stream: ${required}`)
  }
}
