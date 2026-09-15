import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, SNAPSHOT_SCHEMA_VERSION, type SnapshotEnvelope } from '../domain/types'
import { stateDigest } from './digest'
import { migrateSnapshotSchema, snapshotCompatibilityReport } from './migrations'
import historicalSnapshot from './fixtures/engine-0.45.0-schema-44.json'
import historicalSettlementSnapshot from './fixtures/engine-0.45.0-schema-44-settlement.json'
import rejectedHistoricalSnapshot from './fixtures/engine-0.44.0-schema-43.json'
import { SimulationEngine } from '../engine/engine'
import { defaultWorldCreationRequest } from '../domain/worldCreation'

function historicalFixture(): SnapshotEnvelope {
  return structuredClone(historicalSnapshot) as unknown as SnapshotEnvelope
}
function historicalSettlementFixture(): SnapshotEnvelope { return structuredClone(historicalSettlementSnapshot) as unknown as SnapshotEnvelope }

describe('snapshot migration registry', () => {
  it('adds schema-49 identity fields to a schema-48 organization and preserves deterministic continuation', async () => {
    const request = { ...defaultWorldCreationRequest('schema48-real-fields', 16, 12), settlements: [{ id: 'school-place', name: 'School place', preset: 'central' as const }] }
    const source = await SimulationEngine.create(request, 16, 12).snapshot()
    source.schemaVersion = 48; source.engineVersion = '0.49.0'
    source.state.config.organizationModelVersion = 5; source.state.config.contentPackModelVersion = 4
    delete source.state.config.organizationEvolutionModelVersion
    delete source.state.organizationLifecycle.latestTransitionTraces
    expect(source.state.organizations.length).toBeGreaterThan(0)
    for (const organization of source.state.organizations) { delete organization.specialization; delete organization.status; delete organization.lineage }
    source.digest = await stateDigest(source.state)
    const migrated = await migrateSnapshotSchema(source)
    expect(migrated.state.config.organizationEvolutionModelVersion).toBe(0)
    expect(migrated.state.organizations[0]).toMatchObject({ specialization: 'institution', status: 'active' })
    expect(migrated.state.organizations[0]!.lineage).toBeUndefined()
    const first = await SimulationEngine.restore(migrated); const second = await SimulationEngine.restore(migrated)
    expect(first.advance(24, { clockEventHours: false }).events).toEqual(second.advance(24, { clockEventHours: false }).events)
    expect(await first.snapshot()).toEqual(await second.snapshot())
  })

  it('reports the documented current-plus-prior-two release window', () => {
    expect(snapshotCompatibilityReport()).toEqual([
      expect.objectContaining({ schemaVersion: 43, disposition: 'rejected' }),
      expect.objectContaining({ schemaVersion: 44, disposition: 'rejected' }),
      expect.objectContaining({ schemaVersion: 45, disposition: 'rejected' }),
      expect.objectContaining({ schemaVersion: 46, disposition: 'rejected' }),
      expect.objectContaining({ schemaVersion: 47, disposition: 'migratable' }),
      expect.objectContaining({ schemaVersion: 48, disposition: 'migratable' }),
      expect.objectContaining({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, disposition: 'directly-loadable' }),
    ])
  })

  it('rejects the authenticated schema-44 release outside the supported window', async () => {
    await expect(migrateSnapshotSchema(historicalSettlementFixture())).rejects.toThrow('outside the current-plus-prior-two')
  })

  it('rejects the authenticated schema-45 release outside the supported window', async () => {
    const source = historicalSettlementFixture(); source.schemaVersion = 45; source.engineVersion = '0.46.0'; source.digest = await stateDigest(source.state)
    await expect(migrateSnapshotSchema(source)).rejects.toThrow('outside the current-plus-prior-two')
  })

  it('migrates schema 47 with explicit legacy leadership/decision opt-out semantics', async () => {
    const source = await SimulationEngine.create('schema-47-governance-migration').snapshot()
    source.schemaVersion = 47; source.engineVersion = '0.48.0'; source.state.config.contentPackModelVersion = 3; source.state.config.organizationModelVersion = 4
    delete source.state.config.organizationLeadershipDecisionModelVersion
    source.digest = await stateDigest(source.state)
    const migrated = await migrateSnapshotSchema(source)
    expect(migrated).toMatchObject({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, engineVersion: ENGINE_VERSION, state: { config: { organizationModelVersion: 6, contentPackModelVersion: 5, organizationLeadershipDecisionModelVersion: 0, organizationEvolutionModelVersion: 0 }, organizationLifecycle: { latestTransitionTraces: [] } }, migrationProvenance: expect.objectContaining({ sourceSchemaVersion: 47, schemaPath: [{ fromSchemaVersion: 47, toSchemaVersion: 48, kind: 'behavior-upgrade' }, { fromSchemaVersion: 48, toSchemaVersion: 49, kind: 'behavior-upgrade' }] }) })
  })

  it('rejects a corrupted historical fixture before any migration runs', async () => {
    const corrupted = historicalSettlementFixture()
    corrupted.state.tick = 1

    await expect(migrateSnapshotSchema(corrupted)).rejects.toThrow('Snapshot digest does not match its contents')
  })

  it('rejects a correctly re-digested historical state before migration when its schema-44 contract is malformed', async () => {
    const malformed = historicalSettlementFixture()
    malformed.state.config.cohortModelVersion = 999
    malformed.digest = await stateDigest(malformed.state)

    await expect(migrateSnapshotSchema(malformed)).rejects.toThrow('Schema-44 snapshot has incompatible cohortModelVersion')
  })

  it('rejects the genuine 0.44.0 release fixture whose behavioral ordering contract is incompatible', async () => {
    await expect(migrateSnapshotSchema(structuredClone(rejectedHistoricalSnapshot))).rejects.toThrow('locale-dependent ordering')
  })

  it('rejects altered migrated provenance even though the simulation state digest is unchanged', async () => {
    const source = await SimulationEngine.create('provenance-current').snapshot()
    if (!source.migrationProvenance) { source.migrationProvenance = { sourceSchemaVersion: 46, sourceEngineVersion: '0.47.0', sourceDigest: '0'.repeat(64), targetSchemaVersion: SNAPSHOT_SCHEMA_VERSION, targetStateDigest: source.digest, schemaPath: [{ fromSchemaVersion: 46, toSchemaVersion: 47, kind: 'behavior-upgrade' }, { fromSchemaVersion: 47, toSchemaVersion: 48, kind: 'behavior-upgrade' }], targetEnvelopeDigest: '0'.repeat(64) } }
    await expect(migrateSnapshotSchema(source)).rejects.toThrow('Snapshot migration provenance')
  })

  it('rejects unsupported old and future schemas explicitly', async () => {
    const source = historicalFixture()
    source.schemaVersion = 42
    source.digest = await stateDigest(source.state)
    await expect(migrateSnapshotSchema(source)).rejects.toThrow('Unsupported snapshot schema: 42 (old)')

    source.schemaVersion = SNAPSHOT_SCHEMA_VERSION + 1
    source.engineVersion = '9.0.0'
    await expect(migrateSnapshotSchema(source)).rejects.toThrow(`Unsupported snapshot schema: ${SNAPSHOT_SCHEMA_VERSION + 1} (future)`)
  })
})
