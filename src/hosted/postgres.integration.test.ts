import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { PostgresHostedRunStore } from './postgres'
import { HostedRunService } from './runService'
import { DATABASE_MIGRATION_VERSION } from './postgres'
import { HostedSimulationJobManager } from './jobs'
import { DEFAULT_PREINDUSTRIAL_PACK } from '../contentPacks'
import { encodePayload } from './postgres'
import { SharedWorldService, type SharedWorldServiceState } from './sharedWorlds'
import { HOSTED_JOB_VERSION, type HostedSimulationJob } from './types'

const databaseUrl = process.env.TEST_DATABASE_URL
const testIfDatabase = databaseUrl ? describe : describe.skip

testIfDatabase('PostgreSQL hosted persistence integration', () => {
  const storePromise = PostgresHostedRunStore.connect(databaseUrl!)

  beforeEach(async () => {
    const store = await storePromise
    await store.initialize()
    await store.pool.query('TRUNCATE hosted_outbox_events, hosted_shared_mutations, hosted_world_audits, hosted_world_leases, hosted_world_runs, hosted_world_access, hosted_world_revisions, hosted_worlds, hosted_api_tokens, hosted_sessions, hosted_accounts, hosted_event_stream_state, hosted_shared_world_state, hosted_content_packs, hosted_telemetry_batches, hosted_jobs, hosted_run_mutations, hosted_runs RESTART IDENTITY CASCADE')
    await store.pool.query("UPDATE hosted_shared_state_meta SET revision=0 WHERE state_key='default'")
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
    for (const version of [2, 3, 4, 5, 8, 9] as const) {
      await installLegacySchema(store, version)
      await store.initialize()
      const current = await store.pool.query<{ version: number }>('SELECT version FROM world_simulation_schema_migrations ORDER BY version DESC LIMIT 1')
      expect(current.rows[0]?.version).toBe(DATABASE_MIGRATION_VERSION)
      const encodings = await store.pool.query<{ snapshot_encoding: string }>('SELECT snapshot_encoding FROM hosted_runs')
      expect(encodings.rows).toEqual([])
    }
  }, 30_000)

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
  }, 30_000)

  it('persists a validated content pack across hosted catalog reopening', async () => {
    const store = await storePromise
    await store.putPack(DEFAULT_PREINDUSTRIAL_PACK)
    expect((await store.listPacks()).map((pack) => pack.manifest.id)).toEqual([DEFAULT_PREINDUSTRIAL_PACK.manifest.id])
    expect(await store.getPack(DEFAULT_PREINDUSTRIAL_PACK.manifest.id, DEFAULT_PREINDUSTRIAL_PACK.manifest.version)).toEqual(DEFAULT_PREINDUSTRIAL_PACK)
  })
  it('restores noncanonical shared-world collaboration authority after reopening', async () => {
    const store = await storePromise; const now = '2026-01-01T00:00:00.000Z'; const shared = await store.loadSharedWorldService()
    await shared.createAccount('owner', 'owner@example.test', 'correct-horse-battery', now); shared.createWorld('world-1', 'Shared world', 'owner', { terrain: 'plain' }, now)
    await store.saveSharedWorldService(shared)
    expect((await store.loadSharedWorldService()).getWorld('world-1', 'owner')).toMatchObject({ currentRevision: 1, name: 'Shared world' })
  })
  it('rolls back candidate state and telemetry when a transaction write fails', async () => {
    const store = await storePromise; const bootstrap = { runId: 'fault-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('fault-seed') }; const service = await HostedRunService.open(bootstrap, store); const before = await service.observe('secret')
    await store.pool.query("CREATE FUNCTION reject_hosted_telemetry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected telemetry failure'; END $$")
    await store.pool.query('CREATE TRIGGER reject_hosted_telemetry BEFORE INSERT ON hosted_telemetry_batches FOR EACH ROW EXECUTE FUNCTION reject_hosted_telemetry()')
    try {
      await expect(service.execute('secret', { type: 'STEP', requestId: 'fault-step', count: 1 })).rejects.toThrow('telemetry')
      expect(await service.observe('secret')).toEqual(before); expect((await store.load('fault-run'))?.snapshot.digest).toBe(before.digest)
      expect((await store.pool.query("SELECT count(*)::int AS count FROM hosted_run_mutations WHERE run_id='fault-run'")).rows[0]?.count).toBe(0)
    } finally { await store.pool.query('DROP TRIGGER reject_hosted_telemetry ON hosted_telemetry_batches'); await store.pool.query('DROP FUNCTION reject_hosted_telemetry()') }
  })
  it('rolls back snapshot advancement when atomic job progress recording fails', async () => {
    const store = await storePromise; const bootstrap = { runId: 'job-fault-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('job-fault-seed') }; const service = await HostedRunService.open(bootstrap, store); const before = await service.observe('secret'); const now = new Date().toISOString()
    const pendingQuantum = { expectedTick: before.tick, expectedDigest: before.digest, ticks: 24 }
    const job: HostedSimulationJob = { version: HOSTED_JOB_VERSION, recordRevision: 1, jobId: 'fault-job', runId: bootstrap.runId, ownerId: 'owner', status: 'running', queueOrder: 1, startTick: before.tick, totalTicks: 24, advancedTicks: 0, committedTick: before.tick, committedDigest: before.digest, quantumTicks: 24, checkpointIntervalTicks: 24, lastCheckpointTick: before.tick, pendingQuantum, createdAt: now, updatedAt: now }
    await store.saveJob(job, 0)
    await store.pool.query("CREATE FUNCTION reject_hosted_job_progress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected job progress failure'; END $$")
    await store.pool.query('CREATE TRIGGER reject_hosted_job_progress BEFORE UPDATE ON hosted_jobs FOR EACH ROW EXECUTE FUNCTION reject_hosted_job_progress()')
    try {
      await expect(service.advanceJob('secret', before, 24, (after) => ({ ...job, recordRevision: 2, status: 'completed', advancedTicks: 24, committedTick: after.tick, committedDigest: after.digest, pendingQuantum: undefined, lastCheckpointTick: after.tick, updatedAt: new Date().toISOString() }))).rejects.toThrow('job progress')
      expect(await service.observe('secret')).toEqual(before); expect((await store.load(bootstrap.runId))?.snapshot.digest).toBe(before.digest)
      expect(await store.loadJob(bootstrap.runId, job.jobId)).toMatchObject({ recordRevision: 1, status: 'running', pendingQuantum })
    } finally { await store.pool.query('DROP TRIGGER reject_hosted_job_progress ON hosted_jobs'); await store.pool.query('DROP FUNCTION reject_hosted_job_progress()') }
  })
  it('uses PostgreSQL CAS to reject two executors with the same parent digest', async () => {
    const store = await storePromise; const bootstrap = { runId: 'concurrent-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('concurrent-seed') }; const first = await HostedRunService.open(bootstrap, store); const second = await HostedRunService.open(bootstrap, store)
    const outcomes = await Promise.allSettled([first.execute('secret', { type: 'STEP', requestId: 'process-a', count: 1 }), second.execute('secret', { type: 'STEP', requestId: 'process-b', count: 1 })])
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1); expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await store.load('concurrent-run'))?.snapshot.state.tick).toBe(1); expect((await store.pool.query("SELECT count(*)::int AS count FROM hosted_run_mutations WHERE run_id='concurrent-run'")).rows[0]?.count).toBe(1)
  })
  it('uses the shared-state revision lock to prevent multi-process lost updates', async () => {
    const store = await storePromise; const now = '2026-01-01T00:00:00.000Z'; const [first, second] = await Promise.all([store.loadSharedWorldService(), store.loadSharedWorldService()])
    await Promise.all([first.createAccount('first', 'first@example.test', 'correct-horse-battery', now), second.createAccount('second', 'second@example.test', 'correct-horse-battery', now)])
    const outcomes = await Promise.allSettled([store.commitSharedWorldMutation({ expectedRevision: 0, service: first }), store.commitSharedWorldMutation({ expectedRevision: 0, service: second })])
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1); expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await store.loadSharedWorldService()).snapshotState().accounts).toHaveLength(1)
  })
  it('replays the durable outbox after restart and deduplicates event keys', async () => {
    const store = await storePromise; const now = '2026-01-01T00:00:00.000Z'; const shared = await store.loadSharedWorldService(); await shared.createAccount('owner', 'owner@example.test', 'correct-horse-battery', now)
    const first = await store.commitSharedWorldMutation({ expectedRevision: 0, service: shared, event: { key: 'account:owner', topic: 'account.created', payload: { id: 'owner' }, occurredAt: now } }); shared.setStorageRevision(first.revision)
    const retry = shared.fork(); const second = await store.commitSharedWorldMutation({ expectedRevision: first.revision, service: retry, event: { key: 'account:owner', topic: 'account.created', payload: { id: 'owner' }, occurredAt: now } }); retry.setStorageRevision(second.revision)
    expect((await store.outboxAfter()).map((event) => event.key)).toEqual(['account:owner']); expect(await store.outboxAfter(first.event!.id)).toEqual([])
    expect((await store.loadSharedWorldService()).storageRevision()).toBe(2)
  })
  it('keeps shared-world audit and outbox invisible when their transaction fails', async () => {
    const store = await storePromise; const now = '2026-01-01T00:00:00.000Z'; const shared = await store.loadSharedWorldService(); await shared.createAccount('owner', 'owner@example.test', 'correct-horse-battery', now); const accountCommit = await store.commitSharedWorldMutation({ expectedRevision: 0, service: shared }); shared.setStorageRevision(accountCommit.revision)
    const candidate = shared.fork(); candidate.createWorld('world-fault', 'Fault', 'owner', {}, now)
    await store.pool.query("CREATE FUNCTION reject_hosted_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$")
    await store.pool.query('CREATE TRIGGER reject_hosted_audit BEFORE INSERT ON hosted_world_audits FOR EACH ROW EXECUTE FUNCTION reject_hosted_audit()')
    try {
      await expect(store.commitSharedWorldMutation({ expectedRevision: 1, service: candidate, event: { key: 'world:fault', topic: 'world', payload: { id: 'world-fault' }, occurredAt: now } })).rejects.toThrow('audit')
      expect((await store.loadSharedWorldService()).snapshotState().worlds).toHaveLength(0); expect(await store.outboxAfter()).toEqual([])
    } finally { await store.pool.query('DROP TRIGGER reject_hosted_audit ON hosted_world_audits'); await store.pool.query('DROP FUNCTION reject_hosted_audit()') }
  })
  it('backfills and verifies generation-9 blobs into constrained relational tables', async () => {
    const store = await storePromise; await installLegacySchema(store, 9); const now = '2026-01-01T00:00:00.000Z'; const legacy = new SharedWorldService(); await legacy.createAccount('owner', 'owner@example.test', 'correct-horse-battery', now); legacy.createWorld('world-legacy', 'Legacy', 'owner', { terrain: 'plain' }, now); await writeLegacySharedBlobs(store, legacy.snapshotState())
    await store.initialize(); expect((await store.loadSharedWorldService()).getWorld('world-legacy', 'owner')).toMatchObject({ name: 'Legacy', currentRevision: 1 })
    const columns = await store.pool.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='hosted_accounts' ORDER BY column_name")
    expect(columns.rows.map((row) => row.column_name)).toEqual(['account_id', 'created_at', 'email', 'password_hash'])
    expect((await store.pool.query('SELECT count(*)::int AS count FROM hosted_accounts_v9_backup')).rows[0]?.count).toBe(1)
  }, 30_000)
})

async function writeLegacySharedBlobs(store: PostgresHostedRunStore, state: SharedWorldServiceState): Promise<void> {
  const groups: readonly [string, readonly unknown[], (value: any) => string][] = [
    ['hosted_accounts', state.accounts, (value) => value.id], ['hosted_sessions', state.sessions, (value) => value.id], ['hosted_api_tokens', state.tokens, (value) => value.id],
    ['hosted_worlds', state.worlds, (value) => value.id], ['hosted_world_access', state.access, (value) => `${value.worldId}:${value.accountId}`], ['hosted_world_revisions', state.revisions, (value) => `${value.worldId}:${value.revision}`],
    ['hosted_world_leases', state.leases, (value) => value.worldId], ['hosted_world_audits', state.audits, (value) => value.id], ['hosted_world_runs', state.runs ?? [], (value) => value.runId], ['hosted_shared_mutations', state.mutations, (value) => value.key],
  ]
  for (const [table, rows, key] of groups) for (const row of rows) { const payload = encodePayload(row); await store.pool.query(`INSERT INTO ${table}(entity_key,payload,payload_sha256,payload_encoding) VALUES ($1,$2,$3,$4)`, [key(row), payload.compressed, payload.sha256, 'gzip-json-v1']) }
}

async function installLegacySchema(store: PostgresHostedRunStore, version: 2 | 3 | 4 | 5 | 8 | 9): Promise<void> {
  await store.pool.query(`DROP TABLE IF EXISTS hosted_shared_state_meta, hosted_outbox_events, hosted_shared_mutations, hosted_world_audits, hosted_world_leases, hosted_world_runs, hosted_world_access, hosted_world_revisions, hosted_worlds, hosted_api_tokens, hosted_sessions, hosted_accounts,
    hosted_shared_mutations_v9_backup, hosted_world_audits_v9_backup, hosted_world_leases_v9_backup, hosted_world_runs_v9_backup, hosted_world_access_v9_backup, hosted_world_revisions_v9_backup, hosted_worlds_v9_backup, hosted_api_tokens_v9_backup, hosted_sessions_v9_backup, hosted_accounts_v9_backup,
    hosted_run_mutations, hosted_event_stream_state, hosted_shared_world_state, hosted_content_packs, hosted_telemetry_batches, hosted_jobs, hosted_runs, world_simulation_schema_migrations CASCADE`)
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
  if (version >= 2) {
    await store.pool.query(`CREATE TABLE hosted_telemetry_batches (
      batch_id bigserial PRIMARY KEY, run_id text NOT NULL REFERENCES hosted_runs(run_id) ON DELETE CASCADE,
      first_tick bigint NOT NULL, last_tick bigint NOT NULL, event_count integer NOT NULL, statistic_count integer NOT NULL,
      payload bytea NOT NULL, payload_sha256 text NOT NULL, payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0), created_at timestamptz NOT NULL DEFAULT now()
    )`)
  }
  if (version >= 3) {
    await store.pool.query("ALTER TABLE hosted_runs ADD COLUMN snapshot_encoding text NOT NULL DEFAULT 'gzip-json-v1'")
    await store.pool.query("ALTER TABLE hosted_jobs ADD COLUMN payload_encoding text NOT NULL DEFAULT 'gzip-json-v1'")
    await store.pool.query("ALTER TABLE hosted_telemetry_batches ADD COLUMN payload_encoding text NOT NULL DEFAULT 'gzip-json-v1'")
  }
  if (version >= 4) {
    await store.pool.query(`CREATE TABLE hosted_content_packs (
      pack_id text NOT NULL, pack_version text NOT NULL, payload bytea NOT NULL,
      payload_sha256 text NOT NULL, payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0),
      payload_encoding text NOT NULL DEFAULT 'gzip-json-v1', saved_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (pack_id, pack_version)
    )`)
  }
  if (version >= 5) {
    await store.pool.query(`CREATE TABLE hosted_shared_world_state (
      state_key text PRIMARY KEY CHECK (state_key = 'default'), payload bytea NOT NULL,
      payload_sha256 text NOT NULL, payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0),
      payload_encoding text NOT NULL DEFAULT 'gzip-json-v1', saved_at timestamptz NOT NULL DEFAULT now()
    )`)
  }
  if (version >= 6) {
    await store.pool.query(`CREATE TABLE hosted_event_stream_state (
      state_key text PRIMARY KEY CHECK (state_key = 'default'), payload bytea NOT NULL, payload_sha256 text NOT NULL,
      payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0), payload_encoding text NOT NULL DEFAULT 'gzip-json-v1', saved_at timestamptz NOT NULL DEFAULT now()
    )`)
  }
  if (version >= 7) await store.pool.query(`CREATE TABLE hosted_run_mutations (
    run_id text NOT NULL REFERENCES hosted_runs(run_id) ON DELETE CASCADE, mutation_id text NOT NULL, snapshot_digest text NOT NULL,
    committed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (run_id, mutation_id)
  )`)
  if (version >= 8) await store.pool.query("ALTER TABLE hosted_run_mutations ADD COLUMN mutation_fingerprint text NOT NULL DEFAULT ''")
  if (version >= 9) {
    for (const table of ['hosted_accounts', 'hosted_sessions', 'hosted_api_tokens', 'hosted_worlds', 'hosted_world_access', 'hosted_world_revisions', 'hosted_world_leases', 'hosted_world_audits', 'hosted_world_runs', 'hosted_shared_mutations']) await store.pool.query(`CREATE TABLE ${table} (entity_key text PRIMARY KEY, payload bytea NOT NULL, payload_sha256 text NOT NULL, payload_encoding text NOT NULL DEFAULT 'gzip-json-v1')`)
    await store.pool.query(`CREATE TABLE hosted_outbox_events (
      event_id bigserial PRIMARY KEY, topic text NOT NULL, payload bytea NOT NULL, payload_sha256 text NOT NULL,
      payload_encoding text NOT NULL DEFAULT 'gzip-json-v1', occurred_at timestamptz NOT NULL
    )`)
  }
  await store.pool.query('INSERT INTO world_simulation_schema_migrations(version) VALUES ($1)', [version])
}
