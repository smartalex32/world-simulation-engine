import { ENGINE_VERSION, SNAPSHOT_SCHEMA_VERSION, type SnapshotEnvelope, type SnapshotMigrationPathStep } from '../domain/types'
import { canonicalDigest, stateDigest } from './digest'
import { DEFAULT_PREINDUSTRIAL_PACK, createContentPackResolver } from '../../contentPacks'

type SnapshotStateLike = Record<string, unknown>

export interface SnapshotSchemaCompatibility {
  schemaVersion: number
  engineVersions: readonly string[]
  disposition: 'directly-loadable' | 'migratable' | 'rejected'
  reason: string
}

interface SourceEnvelope extends Omit<SnapshotEnvelope, 'state'> { state: SnapshotStateLike }
interface SupportedSchema extends SnapshotSchemaCompatibility { readState(value: unknown): SnapshotStateLike }

/** The explicit current-plus-prior-two release window. */
export const SUPPORTED_SNAPSHOT_SCHEMAS: readonly SnapshotSchemaCompatibility[] = Object.freeze([
  Object.freeze({ schemaVersion: 43, engineVersions: Object.freeze(['0.44.0']), disposition: 'rejected', reason: 'Engine 0.44.0 used locale-dependent ordering and cannot be resumed by a stable-order executor.' }),
  Object.freeze({ schemaVersion: 44, engineVersions: Object.freeze(['0.45.0']), disposition: 'rejected', reason: 'Schema 44 is outside the current-plus-prior-two compatibility window.' }),
  Object.freeze({ schemaVersion: 45, engineVersions: Object.freeze(['0.46.0']), disposition: 'rejected', reason: 'Schema 45 is outside the current-plus-prior-two compatibility window.' }),
  Object.freeze({ schemaVersion: 46, engineVersions: Object.freeze(['0.47.0']), disposition: 'migratable', reason: 'Organization-owned accounts and observer-specific reputation require an explicit schema-47 behavior upgrade.' }),
  Object.freeze({ schemaVersion: 47, engineVersions: Object.freeze(['0.48.0']), disposition: 'migratable', reason: 'Organization leadership and bounded decisions require an explicit schema-48 behavior upgrade.' }),
  Object.freeze({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, engineVersions: Object.freeze([ENGINE_VERSION]), disposition: 'directly-loadable', reason: 'Current envelope and behavioral contract.' }),
])

const supportedSchemas: readonly SupportedSchema[] = [
  { ...SUPPORTED_SNAPSHOT_SCHEMAS[0]!, readState: readSchema43State },
  { ...SUPPORTED_SNAPSHOT_SCHEMAS[1]!, readState: readSchema44State },
  { ...SUPPORTED_SNAPSHOT_SCHEMAS[2]!, readState: readSchema45State },
  { ...SUPPORTED_SNAPSHOT_SCHEMAS[3]!, readState: readSchema46State },
  { ...SUPPORTED_SNAPSHOT_SCHEMAS[4]!, readState: readSchema47State },
  { ...SUPPORTED_SNAPSHOT_SCHEMAS[5]!, readState: readSchema48State },
]

interface MigrationStep {
  fromSchemaVersion: number
  toSchemaVersion: number
  kind: SnapshotMigrationPathStep['kind']
  sourceEngineVersion: string
  targetEngineVersion: string
  upgrade(snapshot: SourceEnvelope): SnapshotStateLike
}

/**
 * A behavior upgrade is named separately from data-shape work: adopting the
 * fixed 0.46.0 world-creation isolation contract is deliberate, never an
 * incidental engine-version rewrite.
 */
const migrationSteps = new Map<number, MigrationStep>([
  [44, {
    fromSchemaVersion: 44,
    toSchemaVersion: 45,
    kind: 'behavior-upgrade',
    sourceEngineVersion: '0.45.0',
    targetEngineVersion: '0.46.0',
    upgrade: (snapshot) => {
      const config = requiredObject(snapshot.state.config, 'Schema-44 state configuration is invalid')
      const worldCreation = requiredObject(config.worldCreation, 'Schema-44 world creation request is invalid')
      const settlements = requiredArray(worldCreation.settlements, 'Schema-44 world creation settlements are invalid')
      return {
        ...snapshot.state,
        config: {
          ...config,
          worldCreation: {
            ...worldCreation,
            settlements: settlements.map((entry) => {
              const settlement = requiredObject(entry, 'Schema-44 world creation settlement is invalid')
              const { scale: _scale, regional: _regional, ...authored } = settlement
              return authored
            }),
          },
        },
      }
    },
  }],
  [45, {
    fromSchemaVersion: 45, toSchemaVersion: 46, kind: 'behavior-upgrade', sourceEngineVersion: '0.46.0', targetEngineVersion: '0.47.0',
    upgrade: (snapshot) => {
      const config = requiredObject(snapshot.state.config, 'Schema-45 state configuration is invalid')
      const resolved = createContentPackResolver([DEFAULT_PREINDUSTRIAL_PACK]).resolve(DEFAULT_PREINDUSTRIAL_PACK.manifest.id, DEFAULT_PREINDUSTRIAL_PACK.manifest.version)
      const isDefaultPreindustrial = config.contentPackId === DEFAULT_PREINDUSTRIAL_PACK.manifest.id && config.contentPackVersion === '1.1.0'
      return {
        ...snapshot.state,
        config: {
          ...config,
          contentPackModelVersion: 3,
          organizationModelVersion: 3,
          ...(isDefaultPreindustrial ? { contentPackVersion: resolved.pack.manifest.version, contentPackChecksum: resolved.checksum, contentPackDependencies: resolved.dependencies } : {}),
        },
        organizationLifecycle: { nextOrganizationSequence: 1, nextTraceSequence: 1, latestFormationTraces: [], latestMembershipTraces: [] },
      }
    },
  }],
  [46, {
    fromSchemaVersion: 46, toSchemaVersion: 47, kind: 'behavior-upgrade', sourceEngineVersion: '0.47.0', targetEngineVersion: '0.48.0',
    upgrade: (snapshot) => {
      const state = requiredObject(snapshot.state, 'Schema-46 snapshot state is invalid')
      const config = requiredObject(state.config, 'Schema-46 snapshot configuration is invalid')
      const organizations = requiredArray(state.organizations, 'Schema-46 organizations are invalid')
      const resolved = createContentPackResolver([DEFAULT_PREINDUSTRIAL_PACK]).resolve(DEFAULT_PREINDUSTRIAL_PACK.manifest.id, DEFAULT_PREINDUSTRIAL_PACK.manifest.version)
      const isLegacyDefaultPreindustrial = config.contentPackId === DEFAULT_PREINDUSTRIAL_PACK.manifest.id && config.contentPackVersion === '1.1.0'
      return { ...state, config: { ...config, organizationModelVersion: 4, organizationAssetReputationModelVersion: 0, ...(isLegacyDefaultPreindustrial ? { contentPackVersion: resolved.pack.manifest.version, contentPackChecksum: resolved.checksum, contentPackDependencies: resolved.dependencies } : {}) }, organizations: organizations.map((entry) => { const organization = requiredObject(entry, 'Schema-46 organization is invalid'); return { ...organization } }) }
    },
  }],
  [47, {
    fromSchemaVersion: 47, toSchemaVersion: 48, kind: 'behavior-upgrade', sourceEngineVersion: '0.48.0', targetEngineVersion: ENGINE_VERSION,
    upgrade: (snapshot) => {
      const state = requiredObject(snapshot.state, 'Schema-47 snapshot state is invalid')
      const config = requiredObject(state.config, 'Schema-47 snapshot configuration is invalid')
      const organizations = requiredArray(state.organizations, 'Schema-47 organizations are invalid')
      return { ...state, config: { ...config, contentPackModelVersion: 4, organizationModelVersion: 5, organizationLeadershipDecisionModelVersion: 0 }, organizations: organizations.map((entry) => ({ ...requiredObject(entry, 'Schema-47 organization is invalid') })) }
    },
  }],
])

/** Returns the explicit compatibility classification for diagnostics and UI. */
export function snapshotCompatibilityReport(): readonly SnapshotSchemaCompatibility[] {
  return SUPPORTED_SNAPSHOT_SCHEMAS
}

/** Reads and authenticates the source before transformation; every target is re-digested. */
export async function migrateSnapshotSchema(value: unknown, targetSchema = SNAPSHOT_SCHEMA_VERSION): Promise<SnapshotEnvelope> {
  const source = await readAuthenticatedSourceEnvelope(value)
  if (targetSchema !== SNAPSHOT_SCHEMA_VERSION) throw new Error(`Unsupported snapshot migration target: ${String(targetSchema)}`)
  const sourceSchema = schemaFor(source.schemaVersion)
  if (sourceSchema.disposition === 'rejected') throw new Error(`Snapshot schema ${source.schemaVersion} is rejected: ${sourceSchema.reason}`)
  if (source.schemaVersion === targetSchema) return source as unknown as SnapshotEnvelope

  let migrated = source
  const path: SnapshotMigrationPathStep[] = []
  while (migrated.schemaVersion < targetSchema) {
    const step = migrationSteps.get(migrated.schemaVersion)
    if (!step) throw new Error(`No migration is registered for snapshot schema: ${migrated.schemaVersion}`)
    if (migrated.engineVersion !== step.sourceEngineVersion) throw new Error(`Snapshot engine version ${migrated.engineVersion} cannot cross schema ${step.fromSchemaVersion}`)
    const state = step.upgrade(migrated)
    path.push({ fromSchemaVersion: step.fromSchemaVersion, toSchemaVersion: step.toSchemaVersion, kind: step.kind })
    const targetEngineVersion = step.kind === 'behavior-upgrade' ? step.targetEngineVersion : migrated.engineVersion
    if (step.kind === 'data-shape' && targetEngineVersion !== migrated.engineVersion) throw new Error('Data-shape migrations cannot change engine behavior')
    const digest = await stateDigest(state)
    const original = migrated.migrationProvenance
    const provenanceBase = {
      sourceSchemaVersion: original?.sourceSchemaVersion ?? source.schemaVersion,
      sourceEngineVersion: original?.sourceEngineVersion ?? source.engineVersion,
      sourceDigest: original?.sourceDigest ?? source.digest,
      targetSchemaVersion: step.toSchemaVersion,
      targetStateDigest: digest,
      schemaPath: [...(original?.schemaPath ?? path.slice(0, -1)), path.at(-1)!],
    }
    const migrationProvenance = {
      ...provenanceBase,
      targetEnvelopeDigest: await migrationProvenanceDigest(step.toSchemaVersion, targetEngineVersion, provenanceBase),
    }
    migrated = {
      schemaVersion: step.toSchemaVersion,
      engineVersion: targetEngineVersion,
      state,
      digest,
      migrationProvenance,
    }
  }
  return migrated as unknown as SnapshotEnvelope
}

async function readAuthenticatedSourceEnvelope(value: unknown): Promise<SourceEnvelope> {
  const envelope = requiredObject(value, 'Snapshot is not an object')
  const schemaVersion = envelope.schemaVersion
  if (!Number.isSafeInteger(schemaVersion)) throw new Error('Snapshot schema version is invalid')
  const support = schemaFor(schemaVersion as number)
  if (typeof envelope.engineVersion !== 'string' || !support.engineVersions.includes(envelope.engineVersion)) throw new Error(`Unsupported engine version for snapshot schema ${schemaVersion}: ${String(envelope.engineVersion)}`)
  if (typeof envelope.digest !== 'string' || !/^[0-9a-f]{64}$/i.test(envelope.digest)) throw new Error('Snapshot digest is invalid')
  const state = support.readState(envelope.state)
  if (await stateDigest(state) !== envelope.digest) throw new Error('Snapshot digest does not match its contents')
  return {
    schemaVersion: schemaVersion as number,
    engineVersion: envelope.engineVersion,
    state,
    digest: envelope.digest,
    ...(envelope.migrationProvenance === undefined ? {} : { migrationProvenance: await readMigrationProvenance(envelope.migrationProvenance, schemaVersion as number, envelope.engineVersion) }),
  }
}

function schemaFor(schemaVersion: number): SupportedSchema {
  const schema = supportedSchemas.find((entry) => entry.schemaVersion === schemaVersion)
  if (!schema) {
    const direction = schemaVersion < SNAPSHOT_SCHEMA_VERSION ? 'old' : 'future'
    throw new Error(`Unsupported snapshot schema: ${String(schemaVersion)} (${direction})`)
  }
  return schema
}

/** Version-specific readers deliberately validate the source envelope shape before a migration. */
function readSchema43State(value: unknown): SnapshotStateLike { return readHistoricalState(value, 43) }
function readSchema44State(value: unknown): SnapshotStateLike { return readHistoricalState(value, 44) }
function readSchema45State(value: unknown): SnapshotStateLike {
  const state = requiredObject(value, 'Schema-45 snapshot state is invalid')
  requiredObject(state.config, 'Schema-45 snapshot configuration is invalid')
  requiredObject(state.world, 'Schema-45 snapshot world is invalid')
  return structuredClone(state)
}
function readSchema46State(value: unknown): SnapshotStateLike {
  const state = requiredObject(value, 'Schema-46 snapshot state is invalid')
  requiredObject(state.config, 'Schema-46 snapshot configuration is invalid')
  requiredObject(state.world, 'Schema-46 snapshot world is invalid')
  return structuredClone(state)
}
function readSchema47State(value: unknown): SnapshotStateLike {
  const state = requiredObject(value, 'Schema-47 snapshot state is invalid')
  requiredObject(state.config, 'Schema-47 snapshot configuration is invalid')
  requiredObject(state.world, 'Schema-47 snapshot world is invalid')
  return structuredClone(state)
}
function readSchema48State(value: unknown): SnapshotStateLike {
  const state = requiredObject(value, 'Schema-48 snapshot state is invalid')
  requiredObject(state.config, 'Schema-48 snapshot configuration is invalid')
  requiredObject(state.world, 'Schema-48 snapshot world is invalid')
  return structuredClone(state)
}
function readHistoricalState(value: unknown, schemaVersion: number): SnapshotStateLike {
  const state = requiredObject(value, `Schema-${schemaVersion} snapshot state is invalid`)
  const config = requiredObject(state.config, `Schema-${schemaVersion} snapshot configuration is invalid`)
  const expectedVersions: Readonly<Record<string, number>> = { worldGeneratorVersion: 1, contentPackModelVersion: 2, variableRegistryVersion: 2, influenceRegistryVersion: 1, householdModelVersion: 4, activityRegistryVersion: 1, developmentRegistryVersion: 2, communityRegistryVersion: 1, environmentModelVersion: 3, lifeCycleModelVersion: 1, economyModelVersion: 3, cultureModelVersion: 1, languageModelVersion: 1, governanceModelVersion: 2, conflictModelVersion: 2, knowledgeModelVersion: 1, healthModelVersion: 2, innovationModelVersion: 1, infrastructureModelVersion: 1, cohortModelVersion: 3 }
  for (const [name, expected] of Object.entries(expectedVersions)) if (config[name] !== expected) throw new Error(`Schema-${schemaVersion} snapshot has incompatible ${name}`)
  if (config.organizationModelVersion !== 2) throw new Error(`Schema-${schemaVersion} snapshot has incompatible organizationModelVersion`)
  if (config.baseTickHours !== 1 || !Number.isSafeInteger(state.tick) || (state.tick as number) < 0) throw new Error(`Schema-${schemaVersion} snapshot clock is invalid`)
  const world = requiredObject(state.world, `Schema-${schemaVersion} snapshot world is invalid`)
  requiredObject(world.grid, `Schema-${schemaVersion} snapshot grid is invalid`)
  requiredArray(world.settlements, `Schema-${schemaVersion} snapshot settlements are invalid`)
  const creation = requiredObject(config.worldCreation, `Schema-${schemaVersion} world creation request is invalid`)
  requiredArray(creation.settlements, `Schema-${schemaVersion} world creation settlements are invalid`)
  return structuredClone(state)
}

async function readMigrationProvenance(value: unknown, schemaVersion: number, engineVersion: string): Promise<SnapshotEnvelope['migrationProvenance']> {
  const provenance = requiredObject(value, 'Snapshot migration provenance is invalid')
  if (!Number.isSafeInteger(provenance.sourceSchemaVersion) || typeof provenance.sourceEngineVersion !== 'string' || typeof provenance.sourceDigest !== 'string' || !/^[0-9a-f]{64}$/i.test(provenance.sourceDigest) || !Number.isSafeInteger(provenance.targetSchemaVersion) || typeof provenance.targetStateDigest !== 'string' || !/^[0-9a-f]{64}$/i.test(provenance.targetStateDigest) || !Array.isArray(provenance.schemaPath) || typeof provenance.targetEnvelopeDigest !== 'string' || !/^[0-9a-f]{64}$/i.test(provenance.targetEnvelopeDigest)) throw new Error('Snapshot migration provenance is invalid')
  const schemaPath = provenance.schemaPath.map((entry) => {
    const step = requiredObject(entry, 'Snapshot migration provenance path is invalid')
    if (!Number.isSafeInteger(step.fromSchemaVersion) || !Number.isSafeInteger(step.toSchemaVersion) || (step.kind !== 'data-shape' && step.kind !== 'behavior-upgrade')) throw new Error('Snapshot migration provenance path is invalid')
    return { fromSchemaVersion: step.fromSchemaVersion as number, toSchemaVersion: step.toSchemaVersion as number, kind: step.kind as SnapshotMigrationPathStep['kind'] }
  })
  const sourceSchema = schemaFor(provenance.sourceSchemaVersion as number)
  const targetSchema = schemaFor(schemaVersion)
  if (!sourceSchema.engineVersions.includes(provenance.sourceEngineVersion) || !targetSchema.engineVersions.includes(engineVersion) || provenance.targetSchemaVersion !== schemaVersion || schemaPath.length < 1 || schemaPath[0]?.fromSchemaVersion !== provenance.sourceSchemaVersion || schemaPath.at(-1)?.toSchemaVersion !== schemaVersion || schemaPath.some((step, index) => step.kind !== 'behavior-upgrade' || (index > 0 && schemaPath[index - 1]!.toSchemaVersion !== step.fromSchemaVersion))) throw new Error('Snapshot migration provenance is incompatible')
  const result = { sourceSchemaVersion: provenance.sourceSchemaVersion as number, sourceEngineVersion: provenance.sourceEngineVersion, sourceDigest: provenance.sourceDigest, targetSchemaVersion: provenance.targetSchemaVersion as number, targetStateDigest: provenance.targetStateDigest, schemaPath, targetEnvelopeDigest: provenance.targetEnvelopeDigest }
  const { targetEnvelopeDigest, ...provenanceBase } = result
  if (await migrationProvenanceDigest(schemaVersion, engineVersion, provenanceBase) !== targetEnvelopeDigest) throw new Error('Snapshot migration provenance digest does not match its contents')
  return result
}

async function migrationProvenanceDigest(schemaVersion: number, engineVersion: string, provenance: Omit<NonNullable<SnapshotEnvelope['migrationProvenance']>, 'targetEnvelopeDigest'>): Promise<string> {
  return canonicalDigest({ schemaVersion, engineVersion, migrationProvenance: provenance })
}

function requiredObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}
function requiredArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(message)
  return value
}
