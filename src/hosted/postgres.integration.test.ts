import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { PostgresHostedRunStore } from './postgres'
import { HostedRunService } from './runService'
import { DATABASE_MIGRATION_VERSION } from './postgres'
import { HostedSimulationJobManager } from './jobs'
import { DEFAULT_PREINDUSTRIAL_PACK } from '../contentPacks'

const databaseUrl = process.env.TEST_DATABASE_URL
const testIfDatabase = databaseUrl ? describe : describe.skip

testIfDatabase('PostgreSQL hosted persistence integration', () => {
  const storePromise = PostgresHostedRunStore.connect(databaseUrl!)

  beforeEach(async () => {
    const store = await storePromise
    await store.initialize()
    await store.pool.query('TRUNCATE hosted_content_packs, hosted_telemetry_batches, hosted_jobs, hosted_runs CASCADE')
  })

  afterAll(async () => { await (await storePromise).close() })

  it('atomically restores a persisted run and its telemetry batch', async () => {
    const store = await storePromise
    const bootstrap = { runId: 'postgres-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('postgres-seed') }
    const first = await HostedRunService.open(bootstrap, store)
    await first.execute('secret', { type: 'STEP', requestId: 'step', count: 24 })
    const persisted = await store.load('postgres-run')
    expect(persisted?.snapshot.state.tick).toBe(24)
    const telemetry = await store.pool.query<{ event_count: number; statistic_count: number; payload_encoding: string }>('SELECT event_count, statistic_count, payload_encoding FROM hosted_telemetry_batches WHERE run_id = $1', ['postgres-run'])
    expect(telemetry.rows).toHaveLength(1)
    expect(telemetry.rows[0]?.event_count).toBeGreaterThan(0)
    expect(telemetry.rows[0]?.payload_encoding).toBe('gzip-json-v1')
    const storedRun = await store.pool.query<{ snapshot_encoding: string }>('SELECT snapshot_encoding FROM hosted_runs WHERE run_id = $1', ['postgres-run'])
    expect(storedRun.rows[0]?.snapshot_encoding).toBe('gzip-json-v1')

    const recovered = await HostedRunService.open(bootstrap, store)
    const observation = await recovered.observe('secret')
    expect(observation.tick).toBe(24)
    expect(observation.digest).toBe(persisted?.snapshot.digest)
  })

  it('migrates each retained prior database generation to the current schema', async () => {
    const store = await storePromise
    for (const version of [1, 2] as const) {
      await installLegacySchema(store, version)
      await store.initialize()
      const current = await store.pool.query<{ version: number }>('SELECT version FROM world_simulation_schema_migrations ORDER BY version DESC LIMIT 1')
      expect(current.rows[0]?.version).toBe(DATABASE_MIGRATION_VERSION)
      const encodings = await store.pool.query<{ snapshot_encoding: string }>('SELECT snapshot_encoding FROM hosted_runs')
      expect(encodings.rows).toEqual([])
    }
  })

  it('rejects a checksum-corrupted canonical snapshot payload', async () => {
    const store = await storePromise
    const bootstrap = { runId: 'corrupt-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('corrupt-seed') }
    await HostedRunService.open(bootstrap, store)
    await store.pool.query("UPDATE hosted_runs SET snapshot_sha256 = repeat('0', 64) WHERE run_id = $1", ['corrupt-run'])
    await expect(store.load('corrupt-run')).rejects.toThrow('checksum')
  })

  it('rejects an unsupported persisted payload encoding', async () => {
    const store = await storePromise
    const bootstrap = { runId: 'encoding-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('encoding-seed') }
    await HostedRunService.open(bootstrap, store)
    await store.pool.query("UPDATE hosted_runs SET snapshot_encoding = 'future-format' WHERE run_id = $1", ['encoding-run'])
    await expect(store.load('encoding-run')).rejects.toThrow('encoding')
  })

  it('recovers durable job state after reopening the authoritative run', async () => {
    const store = await storePromise
    const bootstrap = { runId: 'job-recovery-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('job-recovery-seed') }
    const first = await HostedRunService.open(bootstrap, store)
    const jobs = new HostedSimulationJobManager(first, store, 'owner', 'secret')
    await jobs.start({ jobId: 'advance-three-days', totalTicks: 72, quantumTicks: 24 })
    const completed = await jobs.drain('advance-three-days')
    expect(completed).toMatchObject({ status: 'completed', advancedTicks: 72, committedTick: 72 })

    const recoveredService = await HostedRunService.open(bootstrap, store)
    const recoveredJobs = new HostedSimulationJobManager(recoveredService, store, 'owner', 'secret')
    await recoveredJobs.resumePending()
    await expect(recoveredJobs.get('advance-three-days')).resolves.toMatchObject({ status: 'completed', committedTick: 72 })
    await expect(recoveredService.observe('secret')).resolves.toMatchObject({ tick: 72 })
  })

  it('persists a validated content pack across hosted catalog reopening', async () => {
    const store = await storePromise
    await store.putPack(DEFAULT_PREINDUSTRIAL_PACK)
    expect((await store.listPacks()).map((pack) => pack.manifest.id)).toEqual([DEFAULT_PREINDUSTRIAL_PACK.manifest.id])
    expect(await store.getPack(DEFAULT_PREINDUSTRIAL_PACK.manifest.id, DEFAULT_PREINDUSTRIAL_PACK.manifest.version)).toEqual(DEFAULT_PREINDUSTRIAL_PACK)
  })
})

async function installLegacySchema(store: PostgresHostedRunStore, version: 1 | 2): Promise<void> {
  await store.pool.query('DROP TABLE IF EXISTS hosted_telemetry_batches, hosted_jobs, hosted_runs, world_simulation_schema_migrations CASCADE')
  await store.pool.query('CREATE TABLE world_simulation_schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  await store.pool.query(`CREATE TABLE hosted_runs (
    run_id text PRIMARY KEY, owner_id text NOT NULL, saved_at timestamptz NOT NULL,
    snapshot_payload bytea NOT NULL, snapshot_sha256 text NOT NULL, snapshot_uncompressed_bytes integer NOT NULL CHECK (snapshot_uncompressed_bytes > 0)
  )`)
  await store.pool.query(`CREATE TABLE hosted_jobs (
    run_id text NOT NULL REFERENCES hosted_runs(run_id) ON DELETE CASCADE, job_id text NOT NULL,
    owner_id text NOT NULL, status text NOT NULL, queue_order integer NOT NULL,
    updated_at timestamptz NOT NULL, payload bytea NOT NULL, payload_sha256 text NOT NULL,
    payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0), PRIMARY KEY (run_id, job_id)
  )`)
  if (version === 2) {
    await store.pool.query(`CREATE TABLE hosted_telemetry_batches (
      batch_id bigserial PRIMARY KEY, run_id text NOT NULL REFERENCES hosted_runs(run_id) ON DELETE CASCADE,
      first_tick bigint NOT NULL, last_tick bigint NOT NULL, event_count integer NOT NULL, statistic_count integer NOT NULL,
      payload bytea NOT NULL, payload_sha256 text NOT NULL, payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0), created_at timestamptz NOT NULL DEFAULT now()
    )`)
  }
  await store.pool.query('INSERT INTO world_simulation_schema_migrations(version) VALUES ($1)', [version])
}
