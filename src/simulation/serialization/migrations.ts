import type { SnapshotEnvelope } from '../domain/types'

export const OLDEST_SUPPORTED_SNAPSHOT_SCHEMA = 30

type SnapshotLike = Omit<SnapshotEnvelope, 'schemaVersion'> & { schemaVersion: number }
export type SnapshotMigration = (snapshot: SnapshotLike) => SnapshotLike

/**
 * Each supported schema crosses exactly one audited boundary. Schemas 30–32
 * share the current state shape; retaining distinct steps keeps future schema
 * changes explicit instead of silently treating old data as current.
 */
const migrations = new Map<number, SnapshotMigration>([
  [30, (snapshot) => ({ ...snapshot, schemaVersion: 31 })],
  [31, (snapshot) => ({ ...snapshot, schemaVersion: 32 })],
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

