import { ENGINE_VERSION, type SnapshotEnvelope } from '../domain/types'

export const OLDEST_SUPPORTED_SNAPSHOT_SCHEMA = 30

type SnapshotLike = Omit<SnapshotEnvelope, 'schemaVersion'> & { schemaVersion: number }
export type SnapshotMigration = (snapshot: SnapshotLike) => SnapshotLike

/**
 * Each supported schema crosses exactly one audited boundary. Schemas 30–33
 * share the current state shape; retaining distinct steps keeps future schema
 * changes explicit instead of silently treating old data as current.
 */
const migrations = new Map<number, SnapshotMigration>([
  [30, (snapshot) => ({ ...snapshot, schemaVersion: 31 })],
  [31, (snapshot) => ({ ...snapshot, schemaVersion: 32 })],
  [32, (snapshot) => ({ ...snapshot, engineVersion: ENGINE_VERSION, schemaVersion: 33, state: { ...snapshot.state, config: { ...snapshot.state.config, cohortModelVersion: 1 }, cohorts: [] } })],
  // Scale is optional on legacy settlement markers. The engine initializes it
  // on creation and accepts the missing value as the legacy derived scale.
  [33, (snapshot) => ({ ...snapshot, engineVersion: ENGINE_VERSION, schemaVersion: 34 })],
  [34, (snapshot) => ({ ...snapshot, engineVersion: ENGINE_VERSION, schemaVersion: 35, state: { ...snapshot.state, config: { ...snapshot.state.config, contentPackId: 'setting.preindustrial.default', contentPackVersion: '1.0.0', contentPackModelVersion: 1 } } })],
])

export function migrateSnapshotSchema(value: unknown, targetSchema: number): SnapshotLike {
  if (!value || typeof value !== 'object') throw new Error('Snapshot is not an object')
  let migrated = structuredClone(value) as SnapshotLike
  if (!Number.isSafeInteger(migrated.schemaVersion)) throw new Error('Snapshot schema version is invalid')
  if (migrated.schemaVersion < OLDEST_SUPPORTED_SNAPSHOT_SCHEMA || migrated.schemaVersion > targetSchema) {
    throw new Error(`Unsupported snapshot schema: ${String(migrated.schemaVersion)}`)
  }
  while (migrated.schemaVersion < targetSchema) {
    const migrate = migrations.get(migrated.schemaVersion)
    if (!migrate) throw new Error(`No migration is registered for snapshot schema: ${migrated.schemaVersion}`)
    migrated = migrate(migrated)
  }
  return migrated
}

