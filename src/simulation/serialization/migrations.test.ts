import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, SNAPSHOT_SCHEMA_VERSION, type SnapshotEnvelope } from '../domain/types'
import { stateDigest } from './digest'
import { migrateSnapshotSchema, snapshotCompatibilityReport } from './migrations'
import historicalSnapshot from './fixtures/engine-0.45.0-schema-44.json'
import historicalSettlementSnapshot from './fixtures/engine-0.45.0-schema-44-settlement.json'
import expectedSettlementTarget from './fixtures/engine-0.46.0-schema-45-settlement-expected.json'
import rejectedHistoricalSnapshot from './fixtures/engine-0.44.0-schema-43.json'

function historicalFixture(): SnapshotEnvelope {
  return structuredClone(historicalSnapshot) as unknown as SnapshotEnvelope
}
function historicalSettlementFixture(): SnapshotEnvelope { return structuredClone(historicalSettlementSnapshot) as unknown as SnapshotEnvelope }

describe('snapshot migration registry', () => {
  it('reports the documented current-plus-prior-two release window', () => {
    expect(snapshotCompatibilityReport()).toEqual([
      expect.objectContaining({ schemaVersion: 43, disposition: 'rejected' }),
      expect.objectContaining({ schemaVersion: 44, disposition: 'migratable' }),
      expect.objectContaining({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, disposition: 'directly-loadable' }),
    ])
  })

  it('migrates an immutable state-changing 0.45.0 fixture to its recorded canonical target', async () => {
    const source = historicalSettlementFixture()
    const migrated = await migrateSnapshotSchema(source)

    expect(source).toMatchObject({ schemaVersion: 44, engineVersion: '0.45.0' })
    expect(migrated).toMatchObject({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      digest: await stateDigest(migrated.state),
      migrationProvenance: {
        sourceSchemaVersion: 44,
        sourceEngineVersion: '0.45.0',
        sourceDigest: source.digest,
        targetSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
        schemaPath: [{ fromSchemaVersion: 44, toSchemaVersion: SNAPSHOT_SCHEMA_VERSION, kind: 'behavior-upgrade' }],
      },
    })
    expect(migrated).toEqual(expectedSettlementTarget)
    expect(migrated.state.config.worldCreation.settlements[0]).not.toHaveProperty('regional')
    expect(migrated.state.config.worldCreation.settlements[0]).not.toHaveProperty('scale')
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
    const migrated = await migrateSnapshotSchema(historicalSettlementFixture())
    if (!migrated.migrationProvenance) throw new Error('Missing migration provenance')
    migrated.migrationProvenance.sourceDigest = '0'.repeat(64)

    await expect(migrateSnapshotSchema(migrated)).rejects.toThrow('Snapshot migration provenance digest does not match its contents')
  })

  it('rejects unsupported old and future schemas explicitly', async () => {
    const source = historicalFixture()
    source.schemaVersion = 42
    source.digest = await stateDigest(source.state)
    await expect(migrateSnapshotSchema(source)).rejects.toThrow('Unsupported snapshot schema: 42 (old)')

    source.schemaVersion = SNAPSHOT_SCHEMA_VERSION + 1
    source.engineVersion = '9.0.0'
    await expect(migrateSnapshotSchema(source)).rejects.toThrow('Unsupported snapshot schema: 46 (future)')
  })
})
