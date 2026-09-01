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
  CONTENT_PACK_MODEL_VERSION,
  KNOWLEDGE_MODEL_VERSION,
  HEALTH_MODEL_VERSION,
  INNOVATION_MODEL_VERSION,
  ENGINE_VERSION,
  HOUSEHOLD_MODEL_VERSION,
  INFRASTRUCTURE_MODEL_VERSION,
  INFLUENCE_REGISTRY_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  VARIABLE_REGISTRY_VERSION,
  WORLD_GENERATOR_VERSION,
  type SimulationState,
  type SnapshotEnvelope,
} from '../domain/types'
import { canonicalStringify, stateDigest } from './digest'
import { normalizeWorldCreationRequest } from '../domain/worldCreation'
import { validateCanonicalSimulationState } from '../validation/canonicalState'
import { COHORT_MODEL_VERSION } from '../cohorts/model'
import { migrateSnapshotSchema } from './migrations'
import { DEFAULT_PREINDUSTRIAL_PACK } from '../../contentPacks/defaultPreindustrial'
import { createContentPackRuntime, resolveContentPack, type ContentPack, type ResolvedContentPack } from '../../contentPacks'
import { schema } from '../../shared/schema'

export { canonicalStringify, stateDigest } from './digest'

export const SNAPSHOT_CODEC = schema.asyncCustom<SnapshotEnvelope>({
  $id: 'world-simulation/snapshot-envelope', type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'engineVersion', 'state', 'digest'],
  properties: {
    schemaVersion: { type: 'integer', minimum: 0 }, engineVersion: { type: 'string', minLength: 1 },
    state: { type: 'object' }, digest: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    migrationProvenance: { type: 'object' },
  },
}, (value) => validateSnapshot(value))

export async function createSnapshot(state: SimulationState): Promise<SnapshotEnvelope> {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    state: structuredClone(state),
    digest: await stateDigest(state),
  }
}
/** A caller supplies the exact immutable pack selected for a non-default run.
 * Snapshot payloads carry only its stable reference so content is never silently
 * embedded, reinterpreted, or changed by a later pack edit. */
export async function validateSnapshot(value: unknown, contentPack: ContentPack | ResolvedContentPack = DEFAULT_PREINDUSTRIAL_PACK): Promise<SnapshotEnvelope> {
  const snapshot = await migrateSnapshotSchema(value, SNAPSHOT_SCHEMA_VERSION) as Partial<SnapshotEnvelope>
  if (snapshot.engineVersion !== ENGINE_VERSION) throw new Error(`Unsupported engine version: ${String(snapshot.engineVersion)}`)
  if (!snapshot.state || typeof snapshot.digest !== 'string') throw new Error('Snapshot is missing state or digest')
  if (snapshot.state.config?.baseTickHours !== 1 || !Number.isSafeInteger(snapshot.state.tick) || snapshot.state.tick < 0) {
    throw new Error('Snapshot contains an invalid clock')
  }
  const resolvedPack = resolveContentPack(contentPack)
  const runtime = createContentPackRuntime(resolvedPack.pack)
  const legacyDefaultPackReference = snapshot.state.config.contentPackChecksum === undefined
    && snapshot.state.config.contentPackId === DEFAULT_PREINDUSTRIAL_PACK.manifest.id
    && snapshot.state.config.contentPackVersion === '1.0.0'
    && runtime.pack.manifest.id === DEFAULT_PREINDUSTRIAL_PACK.manifest.id
    && runtime.pack.manifest.version === DEFAULT_PREINDUSTRIAL_PACK.manifest.version
  if (snapshot.state.config.contentPackModelVersion !== CONTENT_PACK_MODEL_VERSION
    || snapshot.state.config.contentPackId !== runtime.pack.manifest.id
    || (snapshot.state.config.contentPackVersion !== runtime.pack.manifest.version && !legacyDefaultPackReference)) {
    throw new Error('Unsupported content pack configuration')
  }
  const expectedDependencies = canonicalStringify(resolvedPack.dependencies)
  const snapshotDependencies = snapshot.state.config.contentPackDependencies
  if (snapshot.state.config.contentPackChecksum !== undefined) {
    if (snapshot.state.config.contentPackChecksum !== resolvedPack.checksum || canonicalStringify(snapshotDependencies) !== expectedDependencies) throw new Error('Snapshot content-pack graph checksum does not match the resolved pack')
  } else if (runtime.pack.manifest.id !== DEFAULT_PREINDUSTRIAL_PACK.manifest.id || runtime.pack.manifest.version !== DEFAULT_PREINDUSTRIAL_PACK.manifest.version) {
    throw new Error('Snapshot content-pack graph checksum is missing for a non-default pack')
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
  if (snapshot.state.config.infrastructureModelVersion !== INFRASTRUCTURE_MODEL_VERSION) {
    throw new Error('Unsupported infrastructure configuration')
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
  if (snapshot.state.config.cohortModelVersion !== COHORT_MODEL_VERSION) throw new Error(`Unsupported cohort model version: ${String(snapshot.state.config.cohortModelVersion)}`)
  if (snapshot.state.config.worldGeneratorVersion !== WORLD_GENERATOR_VERSION) {
    throw new Error(`Unsupported world generator version: ${String(snapshot.state.config.worldGeneratorVersion)}`)
  }
  validateCanonicalSimulationState(snapshot.state, runtime)
  if (snapshot.state.config.worldWidth !== snapshot.state.world.grid.width || snapshot.state.config.worldHeight !== snapshot.state.world.grid.height) {
    throw new Error('Snapshot world dimensions do not match configuration')
  }
  if (snapshot.state.world.scale?.layout !== 'axial-pointy' || snapshot.state.world.scale.hexRadiusMeters < 100 || snapshot.state.world.scale.hexRadiusMeters > 10_000 || !Number.isSafeInteger(snapshot.state.world.scale.hexRadiusMeters)) {
    throw new Error('Snapshot contains an unsupported world scale')
  }
  const normalizedCreation = normalizeWorldCreationRequest(snapshot.state.config.worldCreation, snapshot.state.world.grid.cells, { enforceCreatorLimits: false })
  if (canonicalStringify(normalizedCreation) !== canonicalStringify(snapshot.state.config.worldCreation)) throw new Error('Snapshot contains a non-canonical world creation request')
  const authoredSettlements = snapshot.state.world.settlements.map(({ scale: _scale, regional: _regional, ...settlement }) => settlement)
  if (snapshot.state.world.name !== normalizedCreation.name || canonicalStringify(authoredSettlements) !== canonicalStringify(normalizedCreation.settlements) || canonicalStringify(snapshot.state.world.roads ?? []) !== canonicalStringify(normalizedCreation.roads ?? [])) {
    throw new Error('Snapshot world does not match creation request')
  }
  const actual = await stateDigest(snapshot.state)
  if (actual !== snapshot.digest) throw new Error('Snapshot digest does not match its contents')
  return snapshot as SnapshotEnvelope
}
