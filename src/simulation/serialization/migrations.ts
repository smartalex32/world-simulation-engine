import { ENGINE_VERSION, type SnapshotEnvelope } from '../domain/types'
import { createInfrastructureAssets } from '../infrastructure/model'
import { createEconomyState, initializeGoods } from '../economy/stockFlow'
import { DEFAULT_PREINDUSTRIAL_PACK } from '../../contentPacks/defaultPreindustrial'

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
  [35, (snapshot) => ({ ...snapshot, engineVersion: ENGINE_VERSION, schemaVersion: 36, state: { ...snapshot.state, config: { ...snapshot.state.config, contentPackModelVersion: 2 } } })],
  [36, (snapshot) => ({ ...snapshot, engineVersion: ENGINE_VERSION, schemaVersion: 37, state: { ...snapshot.state, populationFidelity: { version: 1, nextTransitionSequence: 1, protectedPersonIds: [], transitions: [] } } })],
  [37, (snapshot) => ({ ...snapshot, engineVersion: ENGINE_VERSION, schemaVersion: 38, state: { ...snapshot.state, config: { ...snapshot.state.config, cohortModelVersion: 3 }, cohorts: snapshot.state.cohorts.map((cohort) => ({ ...cohort, version: 3, economicProductivityPermille: 1000, culturalCohesionPermille: 500, developmentIndexPermille: 500 })) } })],
  [38, (snapshot) => ({ ...snapshot, engineVersion: ENGINE_VERSION, schemaVersion: 39, state: { ...snapshot.state, config: { ...snapshot.state.config, cohortModelVersion: 3 }, cohorts: snapshot.state.cohorts.map((cohort) => ({ ...cohort, version: 3 })) } })],
  [39, (snapshot) => ({ ...snapshot, engineVersion: ENGINE_VERSION, schemaVersion: 40, state: { ...snapshot.state, config: { ...snapshot.state.config, healthModelVersion: 2 } } })],
  [40, (snapshot) => ({ ...snapshot, engineVersion: ENGINE_VERSION, schemaVersion: 41, state: { ...snapshot.state, config: { ...snapshot.state.config, infrastructureModelVersion: 1 }, infrastructure: createInfrastructureAssets({ roads: snapshot.state.world.roads ?? [], cells: snapshot.state.world.grid.cells, settlements: snapshot.state.world.settlements, markets: snapshot.state.markets, organizations: snapshot.state.organizations, tick: snapshot.state.tick }) } })],
  [41, (snapshot) => ({ ...snapshot, engineVersion: ENGINE_VERSION, schemaVersion: 42, state: { ...snapshot.state, config: { ...snapshot.state.config, economyModelVersion: 3 }, households: snapshot.state.households.map((household) => ({ ...household, ...(household.inventory ? { inventory: initializeGoods(household.inventory) } : {}) })), economy: createEconomyState(snapshot.state.markets, DEFAULT_PREINDUSTRIAL_PACK.economy.goods) } })],
  [42, (snapshot) => ({ ...snapshot, engineVersion: ENGINE_VERSION, schemaVersion: 43, state: { ...snapshot.state, economy: { ...snapshot.state.economy, wageTraces: [] } } })],
  [43, (snapshot) => {
    if (snapshot.engineVersion !== ENGINE_VERSION) throw new Error('Snapshot ordering semantics are incompatible with this engine version')
    return { ...snapshot, schemaVersion: 44 }
  }],
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

