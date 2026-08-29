import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { Pool, type PoolClient } from 'pg'
import { SNAPSHOT_SCHEMA_VERSION, type SimulationEvent, type SnapshotEnvelope, type StatisticSample } from '../simulation/domain/types'
import { canonicalStringify, validateSnapshot } from '../simulation/serialization/snapshot'
import { compareStableText } from '../shared/stableOrder'
import { DEFAULT_PREINDUSTRIAL_PACK, exportContentPack, importContentPack, type ContentPack, type ContentPackCatalog } from '../contentPacks'
import { HOSTED_JOB_VERSION, validateHostedJob, validateHostedRunRecord, type HostedJobStore, type HostedRunMutation, type HostedRunMutationResult, type HostedRunMutationStore, type HostedRunRecord, type HostedRunStore, type HostedSimulationJob, type HostedTelemetryStore } from './types'
import { SharedWorldService, type SharedOutboxEvent, type SharedWorldCommitRequest, type SharedWorldCommitResult, type SharedWorldMutationStore, type SharedWorldServiceState } from './sharedWorlds'
import { HostedEventStream, type HostedEventStreamState } from './eventStream'

/** Current hosted database generation; older generations advance through explicit steps. */
export const DATABASE_MIGRATION_VERSION = 11

/**
 * PostgreSQL durable store. Payload bytes are canonical JSON compressed with
 * gzip and integrity checked before validation. Timestamps are operational
 * metadata and are never part of a simulation digest.
 */
export class PostgresHostedRunStore implements HostedRunStore, HostedJobStore, HostedTelemetryStore, HostedRunMutationStore, ContentPackCatalog, SharedWorldMutationStore {
  constructor(readonly pool: Pool) {}

  static async connect(connectionString: string): Promise<PostgresHostedRunStore> {
    const pool = new Pool({ connectionString })
    const store = new PostgresHostedRunStore(pool)
    await store.verifyConnection()
    return store
  }

  async close(): Promise<void> { await this.pool.end() }

  async assertReady(): Promise<void> {
    let result: { rows: { version: number }[] }
    try {
      result = await this.pool.query<{ version: number }>('SELECT version FROM world_simulation_schema_migrations ORDER BY version DESC LIMIT 1')
    } catch {
      throw new Error('Hosted PostgreSQL schema is not initialized; create and verify a backup, then run pnpm host:migrate')
    }
    if ((result.rows[0]?.version ?? 0) !== DATABASE_MIGRATION_VERSION) throw new Error('Hosted PostgreSQL schema is not current; run pnpm host:migrate after verifying a backup')
    const snapshots = await this.pool.query<StoredPayload>('SELECT snapshot_payload AS payload, snapshot_sha256 AS sha, snapshot_encoding AS encoding FROM hosted_runs')
    for (const row of snapshots.rows) {
      const record = validateHostedRunRecord(decodeStoredPayload(row))
      if (record.snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new Error('Hosted snapshots require guarded migration; verify a backup, then run pnpm host:migrate')
      await this.validateStoredSnapshot(this.pool, record.snapshot)
    }
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('CREATE TABLE IF NOT EXISTS world_simulation_schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
      const current = await client.query<{ version: number }>('SELECT version FROM world_simulation_schema_migrations ORDER BY version DESC LIMIT 1')
      const version = current.rows[0]?.version ?? 0
      if (version > DATABASE_MIGRATION_VERSION) throw new Error(`Hosted database schema ${version} is newer than this application supports`)
      if (version < 1) {
        await client.query(`CREATE TABLE IF NOT EXISTS hosted_runs (
          run_id text PRIMARY KEY, owner_id text NOT NULL, saved_at timestamptz NOT NULL,
          snapshot_payload bytea NOT NULL, snapshot_sha256 text NOT NULL, snapshot_uncompressed_bytes integer NOT NULL CHECK (snapshot_uncompressed_bytes > 0)
        )`)
        await client.query(`CREATE TABLE IF NOT EXISTS hosted_jobs (
          run_id text NOT NULL REFERENCES hosted_runs(run_id) ON DELETE CASCADE, job_id text NOT NULL,
          owner_id text NOT NULL, status text NOT NULL, queue_order integer NOT NULL,
          updated_at timestamptz NOT NULL, payload bytea NOT NULL, payload_sha256 text NOT NULL,
          payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0), PRIMARY KEY (run_id, job_id)
        )`)
        await client.query('CREATE INDEX IF NOT EXISTS hosted_jobs_run_queue ON hosted_jobs(run_id, queue_order, job_id)')
        await client.query('INSERT INTO world_simulation_schema_migrations(version) VALUES (1)')
      }
      if (version < 2) {
        await client.query(`CREATE TABLE IF NOT EXISTS hosted_telemetry_batches (
          batch_id bigserial PRIMARY KEY, run_id text NOT NULL REFERENCES hosted_runs(run_id) ON DELETE CASCADE,
          first_tick bigint NOT NULL, last_tick bigint NOT NULL, event_count integer NOT NULL, statistic_count integer NOT NULL,
          payload bytea NOT NULL, payload_sha256 text NOT NULL, payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0), created_at timestamptz NOT NULL DEFAULT now()
        )`)
        await client.query('CREATE INDEX IF NOT EXISTS hosted_telemetry_batches_run_tick ON hosted_telemetry_batches(run_id, last_tick DESC, batch_id DESC)')
        await client.query('INSERT INTO world_simulation_schema_migrations(version) VALUES (2)')
      }
      if (version < 3) {
        await client.query("ALTER TABLE hosted_runs ADD COLUMN IF NOT EXISTS snapshot_encoding text NOT NULL DEFAULT 'gzip-json-v1'")
        await client.query("ALTER TABLE hosted_jobs ADD COLUMN IF NOT EXISTS payload_encoding text NOT NULL DEFAULT 'gzip-json-v1'")
        await client.query("ALTER TABLE hosted_telemetry_batches ADD COLUMN IF NOT EXISTS payload_encoding text NOT NULL DEFAULT 'gzip-json-v1'")
        await client.query('INSERT INTO world_simulation_schema_migrations(version) VALUES (3)')
      }
      if (version < 4) {
        await client.query(`CREATE TABLE IF NOT EXISTS hosted_content_packs (
          pack_id text NOT NULL, pack_version text NOT NULL, payload bytea NOT NULL,
          payload_sha256 text NOT NULL, payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0),
          payload_encoding text NOT NULL DEFAULT 'gzip-json-v1', saved_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (pack_id, pack_version)
        )`)
        await client.query('INSERT INTO world_simulation_schema_migrations(version) VALUES (4)')
      }
      if (version < 5) {
        await client.query(`CREATE TABLE IF NOT EXISTS hosted_shared_world_state (
          state_key text PRIMARY KEY CHECK (state_key = 'default'), payload bytea NOT NULL,
          payload_sha256 text NOT NULL, payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0),
          payload_encoding text NOT NULL DEFAULT 'gzip-json-v1', saved_at timestamptz NOT NULL DEFAULT now()
        )`)
        await client.query('INSERT INTO world_simulation_schema_migrations(version) VALUES (5)')
      }
      if (version < 6) {
        await client.query(`CREATE TABLE IF NOT EXISTS hosted_event_stream_state (
          state_key text PRIMARY KEY CHECK (state_key = 'default'), payload bytea NOT NULL,
          payload_sha256 text NOT NULL, payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0),
          payload_encoding text NOT NULL DEFAULT 'gzip-json-v1', saved_at timestamptz NOT NULL DEFAULT now()
        )`)
        await client.query('INSERT INTO world_simulation_schema_migrations(version) VALUES (6)')
      }
      if (version < 7) {
        await client.query(`CREATE TABLE IF NOT EXISTS hosted_run_mutations (
          run_id text NOT NULL REFERENCES hosted_runs(run_id) ON DELETE CASCADE, mutation_id text NOT NULL,
          snapshot_digest text NOT NULL, committed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (run_id, mutation_id)
        )`)
        await client.query('INSERT INTO world_simulation_schema_migrations(version) VALUES (7)')
      }
      if (version < 8) {
        await client.query("ALTER TABLE hosted_run_mutations ADD COLUMN IF NOT EXISTS mutation_fingerprint text NOT NULL DEFAULT ''")
        await client.query('INSERT INTO world_simulation_schema_migrations(version) VALUES (8)')
      }
      if (version < 9) {
        for (const table of ['hosted_accounts', 'hosted_sessions', 'hosted_api_tokens', 'hosted_worlds', 'hosted_world_access', 'hosted_world_revisions', 'hosted_world_leases', 'hosted_world_audits', 'hosted_world_runs', 'hosted_shared_mutations']) {
          await client.query(`CREATE TABLE IF NOT EXISTS ${table} (entity_key text PRIMARY KEY, payload bytea NOT NULL, payload_sha256 text NOT NULL, payload_encoding text NOT NULL DEFAULT 'gzip-json-v1')`)
        }
        await client.query(`CREATE TABLE IF NOT EXISTS hosted_outbox_events (
          event_id bigserial PRIMARY KEY, topic text NOT NULL, payload bytea NOT NULL, payload_sha256 text NOT NULL,
          payload_encoding text NOT NULL DEFAULT 'gzip-json-v1', occurred_at timestamptz NOT NULL
        )`)
        await client.query('INSERT INTO world_simulation_schema_migrations(version) VALUES (9)')
      }
      if (version < 10) {
        const legacyShared = await this.loadLegacySharedState(client)
        const legacyJobs = await client.query<StoredPayload & { run_id: string; job_id: string }>('SELECT run_id, job_id, payload, payload_sha256 AS sha, payload_encoding AS encoding FROM hosted_jobs')
        await client.query('ALTER TABLE hosted_jobs ADD COLUMN IF NOT EXISTS job_revision bigint NOT NULL DEFAULT 1 CHECK (job_revision > 0)')
        for (const row of legacyJobs.rows) {
          const decoded = decodeStoredPayload(row) as Record<string, unknown>
          const migrated = decoded.version === 2 ? { ...decoded, version: HOSTED_JOB_VERSION, recordRevision: 1 } : decoded
          const valid = validateHostedJob(migrated); const encoded = encodePayload(valid)
          await client.query('UPDATE hosted_jobs SET job_revision=$3,payload=$4,payload_sha256=$5,payload_uncompressed_bytes=$6,payload_encoding=$7 WHERE run_id=$1 AND job_id=$2', [row.run_id, row.job_id, valid.recordRevision, encoded.compressed, encoded.sha256, encoded.uncompressedBytes, PAYLOAD_ENCODING])
        }
        await client.query('ALTER TABLE hosted_outbox_events ADD COLUMN IF NOT EXISTS event_key text')
        await client.query("UPDATE hosted_outbox_events SET event_key='legacy:' || event_id::text WHERE event_key IS NULL")
        await client.query('ALTER TABLE hosted_outbox_events ALTER COLUMN event_key SET NOT NULL')
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS hosted_outbox_event_key ON hosted_outbox_events(event_key)')
        for (const table of SHARED_BLOB_TABLES) await client.query(`ALTER TABLE ${table} RENAME TO ${table}_v9_backup`)
        await this.createRelationalSharedSchema(client)
        await client.query("INSERT INTO hosted_shared_state_meta(state_key, revision) VALUES ('default', 0)")
        await this.writeNormalizedSharedState(client, legacyShared)
        const restored = await this.loadNormalizedSharedState(client)
        if (sharedStateFingerprint(restored.state) !== sharedStateFingerprint(legacyShared)) throw new Error('Hosted shared-world migration verification failed')
        await client.query('INSERT INTO world_simulation_schema_migrations(version) VALUES (10)')
      }
      if (version < 11) {
        await client.query(`CREATE TABLE IF NOT EXISTS hosted_snapshot_migration_backups (
          run_id text NOT NULL, source_schema_version integer NOT NULL, source_engine_version text NOT NULL, source_digest text NOT NULL,
          target_schema_version integer NOT NULL, target_engine_version text NOT NULL, target_digest text NOT NULL,
          source_payload bytea NOT NULL, source_payload_sha256 text NOT NULL, source_payload_encoding text NOT NULL,
          migrated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (run_id, source_schema_version, source_digest, target_schema_version)
        )`)
        await client.query('INSERT INTO world_simulation_schema_migrations(version) VALUES (11)')
      }
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  async load(runId: string): Promise<HostedRunRecord | undefined> {
    const result = await this.pool.query<StoredPayload>('SELECT snapshot_payload AS payload, snapshot_sha256 AS sha, snapshot_encoding AS encoding FROM hosted_runs WHERE run_id = $1', [runId])
    return result.rows[0] ? validateHostedRunRecord(decodeStoredPayload(result.rows[0])) : undefined
  }

  async save(record: HostedRunRecord): Promise<void> { await this.saveWithTelemetry(record, [], []) }

  async saveWithTelemetry(record: HostedRunRecord, events: readonly SimulationEvent[], statistics: readonly StatisticSample[]): Promise<void> {
    const valid = validateHostedRunRecord(record)
    const snapshot = encodePayload(valid)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await this.saveRun(client, valid, snapshot)
      if (events.length || statistics.length) {
        const telemetry = encodePayload({ events: [...events], statistics: [...statistics] })
        const ticks = [...events.map((event) => event.tick), ...statistics.map((sample) => sample.tick)]
        await client.query(`INSERT INTO hosted_telemetry_batches(run_id, first_tick, last_tick, event_count, statistic_count, payload, payload_sha256, payload_uncompressed_bytes, payload_encoding)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [valid.runId, Math.min(...ticks), Math.max(...ticks), events.length, statistics.length, telemetry.compressed, telemetry.sha256, telemetry.uncompressedBytes, PAYLOAD_ENCODING])
      }
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  /**
   * Called only by the guarded host:migrate command after its external backup
   * has been verified. Original authenticated envelopes are retained in the
   * database before their migrated replacements become visible.
   */
  async migrateStoredSnapshots(): Promise<number> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const rows = await client.query<StoredPayload & { run_id: string }>('SELECT run_id, snapshot_payload AS payload, snapshot_sha256 AS sha, snapshot_encoding AS encoding FROM hosted_runs ORDER BY run_id ASC FOR UPDATE')
      let migratedCount = 0
      for (const row of rows.rows) {
        const record = validateHostedRunRecord(decodeStoredPayload(row))
        const migrated = await this.validateStoredSnapshot(client, record.snapshot)
        if (record.snapshot.schemaVersion === SNAPSHOT_SCHEMA_VERSION) continue
        const jobs = await client.query<StoredPayload & { run_id: string; job_id: string }>('SELECT run_id, job_id, payload, payload_sha256 AS sha, payload_encoding AS encoding FROM hosted_jobs WHERE run_id = $1 ORDER BY job_id ASC FOR UPDATE', [record.runId])
        const existingBackup = await client.query<{ source_payload_sha256: string }>('SELECT source_payload_sha256 FROM hosted_snapshot_migration_backups WHERE run_id = $1 AND source_schema_version = $2 AND source_digest = $3 AND target_schema_version = $4', [record.runId, record.snapshot.schemaVersion, record.snapshot.digest, migrated.schemaVersion])
        if (existingBackup.rows[0] && existingBackup.rows[0].source_payload_sha256 !== row.sha) throw new Error('Hosted snapshot migration backup does not match the source artifact')
        if (!existingBackup.rows[0]) await client.query(`INSERT INTO hosted_snapshot_migration_backups(run_id, source_schema_version, source_engine_version, source_digest, target_schema_version, target_engine_version, target_digest, source_payload, source_payload_sha256, source_payload_encoding)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [record.runId, record.snapshot.schemaVersion, record.snapshot.engineVersion, record.snapshot.digest, migrated.schemaVersion, migrated.engineVersion, migrated.digest, row.payload, row.sha, row.encoding])
        const next = validateHostedRunRecord({ ...record, snapshot: { ...record.snapshot, ...migrated } })
        await this.saveRun(client, next, encodePayload(next))
        for (const jobRow of jobs.rows) await this.reconcileMigratedSnapshotJob(client, jobRow, record, next)
        migratedCount += 1
      }
      await client.query('COMMIT')
      return migratedCount
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  /** Job state names the durable run digest explicitly, so snapshot upgrades
   * must reconcile only references to the exact source state in the same lock. */
  private async reconcileMigratedSnapshotJob(client: PoolClient, row: StoredPayload & { run_id: string; job_id: string }, source: HostedRunRecord, target: HostedRunRecord): Promise<void> {
    const job = validateHostedJob(decodeStoredPayload(row))
    const sourceTick = source.snapshot.state.tick
    const sourceDigest = source.snapshot.digest
    const active = job.status === 'queued' || job.status === 'running' || job.status === 'cancelling'
    if (active && (job.committedTick !== sourceTick || job.committedDigest !== sourceDigest)) throw new Error('Active hosted job committed state is incompatible with the snapshot migration source')
    let next = job
    if (active || job.committedTick === sourceTick) {
      if (job.committedDigest !== sourceDigest) throw new Error('Hosted job committed digest is incompatible with the snapshot migration source')
      next = { ...next, committedDigest: target.snapshot.digest }
    }
    if (job.pendingQuantum) {
      if (job.pendingQuantum.expectedTick !== sourceTick || job.pendingQuantum.expectedDigest !== sourceDigest) throw new Error('Hosted job pending quantum is incompatible with the snapshot migration source')
      next = { ...next, pendingQuantum: { ...job.pendingQuantum, expectedDigest: target.snapshot.digest } }
    }
    if (canonicalStringify(next) === canonicalStringify(job)) return
    next = { ...next, recordRevision: job.recordRevision + 1 }
    await this.saveJobWithClient(client, validateHostedJob(next), job.recordRevision)
  }

  private async validateStoredSnapshot(client: Pool | PoolClient, snapshot: SnapshotEnvelope): Promise<SnapshotEnvelope> {
    const config = snapshot.state?.config
    const packId = config?.contentPackId
    const packVersion = config?.contentPackVersion
    if (typeof packId !== 'string' || typeof packVersion !== 'string') throw new Error('Hosted snapshot content pack reference is invalid')
    if (packId === DEFAULT_PREINDUSTRIAL_PACK.manifest.id && packVersion === DEFAULT_PREINDUSTRIAL_PACK.manifest.version) return validateSnapshot(snapshot)
    const stored = await client.query<StoredPayload>('SELECT payload,payload_sha256 AS sha,payload_encoding AS encoding FROM hosted_content_packs WHERE pack_id=$1 AND pack_version=$2', [packId, packVersion])
    if (!stored.rows[0]) throw new Error(`Hosted snapshot content pack is unavailable: ${packId}@${packVersion}`)
    return validateSnapshot(snapshot, importContentPack(JSON.stringify(decodeStoredPayload(stored.rows[0]))))
  }

  /** Locks the durable row before checking the candidate's exact parent state.
   * Nothing becomes visible until snapshot, telemetry, job, and mutation ID commit. */
  async commitRunMutation(mutation: HostedRunMutation): Promise<HostedRunMutationResult> {
    const valid = validateHostedRunRecord(mutation.record)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const current = await client.query<StoredPayload>('SELECT snapshot_payload AS payload, snapshot_sha256 AS sha, snapshot_encoding AS encoding FROM hosted_runs WHERE run_id = $1 FOR UPDATE', [valid.runId])
      if (!current.rows[0]) throw new Error('Hosted run state conflict')
      const existing = await client.query<{ snapshot_digest: string; mutation_fingerprint: string }>('SELECT snapshot_digest, mutation_fingerprint FROM hosted_run_mutations WHERE run_id = $1 AND mutation_id = $2', [valid.runId, mutation.mutationId])
      if (existing.rows[0]) {
        if (existing.rows[0].mutation_fingerprint !== mutation.mutationFingerprint) throw new Error('Hosted mutation ID was reused with a different request')
        await client.query('COMMIT'); return { outcome: 'already-committed' }
      }
      const currentRecord = validateHostedRunRecord(decodeStoredPayload(current.rows[0]))
      if (currentRecord.snapshot.state.tick !== mutation.expectedTick || currentRecord.snapshot.digest !== mutation.expectedDigest) throw new Error('Hosted job run state conflict')
      await this.saveRun(client, valid, encodePayload(valid))
      if (mutation.events.length || mutation.statistics.length) await this.insertTelemetry(client, valid.runId, mutation.events, mutation.statistics)
      if (mutation.job) await this.saveJobWithClient(client, mutation.job, mutation.job.recordRevision - 1)
      const sharedWorld = mutation.sharedWorld ? await this.commitSharedWorldWithClient(client, mutation.sharedWorld) : undefined
      await client.query('INSERT INTO hosted_run_mutations(run_id, mutation_id, snapshot_digest, mutation_fingerprint) VALUES ($1,$2,$3,$4)', [valid.runId, mutation.mutationId, valid.snapshot.digest, mutation.mutationFingerprint])
      await client.query('COMMIT'); return { outcome: 'committed', ...(sharedWorld ? { sharedWorld } : {}) }
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  async list(ownerId: string): Promise<HostedRunRecord[]> {
    const result = await this.pool.query<StoredPayload>('SELECT snapshot_payload AS payload, snapshot_sha256 AS sha, snapshot_encoding AS encoding FROM hosted_runs WHERE owner_id = $1 ORDER BY run_id ASC', [ownerId])
    return result.rows.map((row) => validateHostedRunRecord(decodeStoredPayload(row))).sort((a, b) => compareStableText(a.runId, b.runId))
  }

  async loadJob(runId: string, jobId: string): Promise<HostedSimulationJob | undefined> {
    const result = await this.pool.query<StoredPayload>('SELECT payload, payload_sha256 AS sha, payload_encoding AS encoding FROM hosted_jobs WHERE run_id = $1 AND job_id = $2', [runId, jobId])
    return result.rows[0] ? validateHostedJob(decodeStoredPayload(result.rows[0])) : undefined
  }

  async saveJob(job: HostedSimulationJob, expectedRecordRevision: number): Promise<void> {
    await this.saveJobWithClient(this.pool, job, expectedRecordRevision)
  }
  private async saveJobWithClient(client: Pool | PoolClient, job: HostedSimulationJob, expectedRecordRevision: number): Promise<void> {
    const valid = validateHostedJob(job); const payload = encodePayload(valid)
    if (valid.recordRevision !== expectedRecordRevision + 1) throw new Error('Hosted job state conflict')
    if (expectedRecordRevision === 0) {
      try {
        await client.query(`INSERT INTO hosted_jobs(run_id, job_id, owner_id, status, queue_order, updated_at, job_revision, payload, payload_sha256, payload_uncompressed_bytes, payload_encoding)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [valid.runId, valid.jobId, valid.ownerId, valid.status, valid.queueOrder, valid.updatedAt, valid.recordRevision, payload.compressed, payload.sha256, payload.uncompressedBytes, PAYLOAD_ENCODING])
      } catch (error) { throw new Error('Hosted job state conflict', { cause: error }) }
      return
    }
    const updated = await client.query(`UPDATE hosted_jobs SET owner_id=$4,status=$5,queue_order=$6,updated_at=$7,job_revision=$8,payload=$9,payload_sha256=$10,payload_uncompressed_bytes=$11,payload_encoding=$12 WHERE run_id=$1 AND job_id=$2 AND job_revision=$3`,
      [valid.runId, valid.jobId, expectedRecordRevision, valid.ownerId, valid.status, valid.queueOrder, valid.updatedAt, valid.recordRevision, payload.compressed, payload.sha256, payload.uncompressedBytes, PAYLOAD_ENCODING])
    if (updated.rowCount !== 1) throw new Error('Hosted job state conflict')
  }

  async listJobs(runId: string): Promise<HostedSimulationJob[]> {
    const result = await this.pool.query<StoredPayload>('SELECT payload, payload_sha256 AS sha, payload_encoding AS encoding FROM hosted_jobs WHERE run_id = $1 ORDER BY queue_order ASC, job_id ASC', [runId])
    return result.rows.map((row) => validateHostedJob(decodeStoredPayload(row))).sort((a, b) => a.queueOrder - b.queueOrder || compareStableText(a.jobId, b.jobId))
  }

  async listPacks(): Promise<readonly ContentPack[]> {
    const result = await this.pool.query<StoredPayload>('SELECT payload, payload_sha256 AS sha, payload_encoding AS encoding FROM hosted_content_packs ORDER BY pack_id ASC, pack_version ASC')
    return Object.freeze(result.rows.map((row) => importContentPack(JSON.stringify(decodeStoredPayload(row)))))
  }
  async getPack(id: string, version: string): Promise<ContentPack | undefined> {
    const result = await this.pool.query<StoredPayload>('SELECT payload, payload_sha256 AS sha, payload_encoding AS encoding FROM hosted_content_packs WHERE pack_id = $1 AND pack_version = $2', [id, version])
    return result.rows[0] ? importContentPack(JSON.stringify(decodeStoredPayload(result.rows[0]))) : undefined
  }
  async putPack(pack: ContentPack): Promise<ContentPack> {
    const valid = importContentPack(exportContentPack(pack)); const payload = encodePayload(valid)
    await this.pool.query(`INSERT INTO hosted_content_packs(pack_id, pack_version, payload, payload_sha256, payload_uncompressed_bytes, payload_encoding)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (pack_id, pack_version) DO NOTHING`, [valid.manifest.id, valid.manifest.version, payload.compressed, payload.sha256, payload.uncompressedBytes, PAYLOAD_ENCODING])
    const stored = await this.getPack(valid.manifest.id, valid.manifest.version)
    if (!stored || exportContentPack(stored) !== exportContentPack(valid)) throw new Error(`Content pack version is immutable: ${valid.manifest.id}@${valid.manifest.version}`)
    return valid
  }
  async loadSharedWorldService(): Promise<SharedWorldService> {
    const loaded = await this.loadNormalizedSharedState(this.pool)
    return SharedWorldService.restore(loaded.state, loaded.revision)
  }
  async saveSharedWorldService(service: SharedWorldService): Promise<void> {
    const committed = await this.commitSharedWorldMutation({ expectedRevision: service.storageRevision(), service })
    service.setStorageRevision(committed.revision)
  }
  async commitSharedWorldMutation(request: SharedWorldCommitRequest): Promise<SharedWorldCommitResult> {
    const client = await this.pool.connect()
    try { await client.query('BEGIN'); const result = await this.commitSharedWorldWithClient(client, request); await client.query('COMMIT'); return result }
    catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }
  async outboxAfter(lastEventId = 0): Promise<readonly SharedOutboxEvent[]> {
    if (!Number.isSafeInteger(lastEventId) || lastEventId < 0) throw new Error('Last-Event-ID is invalid')
    const rows = await this.pool.query<StoredPayload & { id: string; event_key: string; topic: string; created_at: Date }>('SELECT event_id::text AS id, event_key, topic, payload, payload_sha256 AS sha, payload_encoding AS encoding, occurred_at AS created_at FROM hosted_outbox_events WHERE event_id > $1 ORDER BY event_id ASC', [lastEventId])
    return rows.rows.map((row) => ({ id: Number(row.id), key: row.event_key, topic: row.topic, payload: decodeStoredPayload(row), createdAt: row.created_at.toISOString() }))
  }
  async loadEventStream(capacity = 1_000): Promise<HostedEventStream> {
    const result = await this.pool.query<StoredPayload>('SELECT payload, payload_sha256 AS sha, payload_encoding AS encoding FROM hosted_event_stream_state WHERE state_key = $1', ['default'])
    return result.rows[0] ? HostedEventStream.restore(decodeStoredPayload(result.rows[0]) as HostedEventStreamState, capacity) : new HostedEventStream(capacity)
  }
  async saveEventStream(stream: HostedEventStream): Promise<void> {
    const payload = encodePayload(stream.snapshotState())
    await this.pool.query(`INSERT INTO hosted_event_stream_state(state_key, payload, payload_sha256, payload_uncompressed_bytes, payload_encoding)
      VALUES ('default',$1,$2,$3,$4) ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, payload_sha256 = EXCLUDED.payload_sha256, payload_uncompressed_bytes = EXCLUDED.payload_uncompressed_bytes, payload_encoding = EXCLUDED.payload_encoding, saved_at = now()`, [payload.compressed, payload.sha256, payload.uncompressedBytes, PAYLOAD_ENCODING])
  }

  private async commitSharedWorldWithClient(client: PoolClient, request: Omit<SharedWorldCommitRequest, 'initialRun'> | SharedWorldCommitRequest): Promise<SharedWorldCommitResult> {
    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0 || request.service.storageRevision() !== request.expectedRevision) throw new Error('Shared world state conflict')
    const locked = await client.query<{ revision: string }>("SELECT revision::text FROM hosted_shared_state_meta WHERE state_key='default' FOR UPDATE")
    const currentRevision = Number(locked.rows[0]?.revision)
    if (!Number.isSafeInteger(currentRevision) || currentRevision !== request.expectedRevision) throw new Error('Shared world state conflict')
    const state = request.service.snapshotState(); SharedWorldService.restore(state, request.expectedRevision)
    if ('initialRun' in request && request.initialRun) {
      const run = validateHostedRunRecord(request.initialRun)
      const existing = await client.query('SELECT 1 FROM hosted_runs WHERE run_id=$1', [run.runId])
      if (existing.rowCount) throw new Error('Hosted run state conflict')
      await this.saveRun(client, run, encodePayload(run))
    }
    await this.writeNormalizedSharedState(client, state)
    const event = request.event ? await this.insertOutboxEvent(client, request.event) : undefined
    const nextRevision = currentRevision + 1
    const updated = await client.query("UPDATE hosted_shared_state_meta SET revision=$1 WHERE state_key='default' AND revision=$2", [nextRevision, currentRevision])
    if (updated.rowCount !== 1) throw new Error('Shared world state conflict')
    return { revision: nextRevision, ...(event ? { event } : {}) }
  }

  private async insertOutboxEvent(client: PoolClient, input: NonNullable<SharedWorldCommitRequest['event']>): Promise<SharedOutboxEvent> {
    if (!input.key || !input.topic || !input.occurredAt) throw new Error('Hosted outbox event is invalid')
    const payload = encodePayload(input.payload)
    const inserted = await client.query<{ id: string; created_at: Date }>(`INSERT INTO hosted_outbox_events(event_key,topic,payload,payload_sha256,payload_encoding,occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (event_key) DO NOTHING RETURNING event_id::text AS id, occurred_at AS created_at`, [input.key, input.topic, payload.compressed, payload.sha256, PAYLOAD_ENCODING, input.occurredAt])
    if (inserted.rows[0]) return { id: Number(inserted.rows[0].id), key: input.key, topic: input.topic, payload: structuredClone(input.payload), createdAt: inserted.rows[0].created_at.toISOString() }
    const existing = await client.query<StoredPayload & { id: string; topic: string; created_at: Date }>('SELECT event_id::text AS id,topic,payload,payload_sha256 AS sha,payload_encoding AS encoding,occurred_at AS created_at FROM hosted_outbox_events WHERE event_key=$1', [input.key])
    const row = existing.rows[0]
    if (!row || row.topic !== input.topic || row.sha !== payload.sha256) throw new Error('Hosted outbox event key was reused with different content')
    return { id: Number(row.id), key: input.key, topic: row.topic, payload: decodeStoredPayload(row), createdAt: row.created_at.toISOString() }
  }

  private async createRelationalSharedSchema(client: PoolClient): Promise<void> {
    await client.query(`CREATE TABLE hosted_accounts (
      account_id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL, created_at timestamptz NOT NULL
    )`)
    await client.query(`CREATE TABLE hosted_sessions (
      session_id text PRIMARY KEY, account_id text NOT NULL REFERENCES hosted_accounts(account_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL
    )`)
    await client.query(`CREATE TABLE hosted_api_tokens (
      token_id text PRIMARY KEY, account_id text NOT NULL REFERENCES hosted_accounts(account_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      token_hash text NOT NULL UNIQUE, scopes text[] NOT NULL CHECK (cardinality(scopes) > 0), created_at timestamptz NOT NULL, expires_at timestamptz
    )`)
    await client.query(`CREATE TABLE hosted_worlds (
      world_id text PRIMARY KEY, name text NOT NULL CHECK (length(name) > 0), owner_account_id text NOT NULL REFERENCES hosted_accounts(account_id) DEFERRABLE INITIALLY DEFERRED,
      current_revision integer NOT NULL CHECK (current_revision > 0), created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
    )`)
    await client.query(`CREATE TABLE hosted_world_access (
      world_id text NOT NULL REFERENCES hosted_worlds(world_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      account_id text NOT NULL REFERENCES hosted_accounts(account_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      role text NOT NULL CHECK (role IN ('owner','editor','viewer')), PRIMARY KEY (world_id,account_id)
    )`)
    await client.query(`CREATE TABLE hosted_world_revisions (
      world_id text NOT NULL REFERENCES hosted_worlds(world_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED, revision integer NOT NULL CHECK (revision > 0),
      parent_revision integer, canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'), author_account_id text NOT NULL REFERENCES hosted_accounts(account_id) DEFERRABLE INITIALLY DEFERRED,
      payload bytea NOT NULL, payload_sha256 text NOT NULL, payload_uncompressed_bytes integer NOT NULL CHECK (payload_uncompressed_bytes > 0), payload_encoding text NOT NULL DEFAULT 'gzip-json-v1', created_at timestamptz NOT NULL,
      PRIMARY KEY (world_id,revision), FOREIGN KEY (world_id,parent_revision) REFERENCES hosted_world_revisions(world_id,revision) DEFERRABLE INITIALLY DEFERRED
    )`)
    await client.query('ALTER TABLE hosted_worlds ADD CONSTRAINT hosted_world_current_revision_fk FOREIGN KEY (world_id,current_revision) REFERENCES hosted_world_revisions(world_id,revision) DEFERRABLE INITIALLY DEFERRED')
    await client.query(`CREATE TABLE hosted_world_leases (
      world_id text PRIMARY KEY REFERENCES hosted_worlds(world_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED, lease_id text NOT NULL UNIQUE,
      holder_account_id text NOT NULL REFERENCES hosted_accounts(account_id) DEFERRABLE INITIALLY DEFERRED, revision integer NOT NULL,
      expires_at timestamptz NOT NULL, FOREIGN KEY (world_id,revision) REFERENCES hosted_world_revisions(world_id,revision) DEFERRABLE INITIALLY DEFERRED
    )`)
    await client.query(`CREATE TABLE hosted_world_audits (
      audit_id text PRIMARY KEY, world_id text NOT NULL REFERENCES hosted_worlds(world_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      actor_account_id text NOT NULL REFERENCES hosted_accounts(account_id) DEFERRABLE INITIALLY DEFERRED, action text NOT NULL,
      revision integer NOT NULL, created_at timestamptz NOT NULL, FOREIGN KEY (world_id,revision) REFERENCES hosted_world_revisions(world_id,revision) DEFERRABLE INITIALLY DEFERRED
    )`)
    await client.query(`CREATE TABLE hosted_world_runs (
      run_id text PRIMARY KEY REFERENCES hosted_runs(run_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      world_id text NOT NULL, revision integer NOT NULL, owner_account_id text NOT NULL REFERENCES hosted_accounts(account_id) DEFERRABLE INITIALLY DEFERRED,
      created_at timestamptz NOT NULL, FOREIGN KEY (world_id,revision) REFERENCES hosted_world_revisions(world_id,revision) DEFERRABLE INITIALLY DEFERRED
    )`)
    await client.query(`CREATE TABLE hosted_shared_mutations (
      mutation_key text PRIMARY KEY, world_id text NOT NULL, revision integer NOT NULL,
      FOREIGN KEY (world_id,revision) REFERENCES hosted_world_revisions(world_id,revision) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )`)
    await client.query(`CREATE TABLE hosted_shared_state_meta (
      state_key text PRIMARY KEY CHECK (state_key='default'), revision bigint NOT NULL CHECK (revision >= 0)
    )`)
  }

  private async loadLegacySharedState(client: PoolClient): Promise<SharedWorldServiceState> {
    const read = async (table: string): Promise<unknown[]> => (await client.query<StoredPayload>(`SELECT payload,payload_sha256 AS sha,payload_encoding AS encoding FROM ${table} ORDER BY entity_key ASC`)).rows.map(decodeStoredPayload)
    const groups: unknown[][] = []
    // A PoolClient processes one query at a time. Keep migration reads explicit
    // and sequential rather than relying on deprecated concurrent scheduling.
    for (const table of SHARED_BLOB_TABLES) groups.push(await read(table))
    const [accounts = [], sessions = [], tokens = [], worlds = [], access = [], revisions = [], leases = [], audits = [], runs = [], mutations = []] = groups
    const normalized = { version: 1 as const, accounts, sessions, tokens, worlds, access, revisions, leases, audits, runs, mutations } as SharedWorldServiceState
    if (accounts.length || worlds.length || sessions.length || tokens.length) return SharedWorldService.restore(normalized).snapshotState()
    const legacy = await client.query<StoredPayload>("SELECT payload,payload_sha256 AS sha,payload_encoding AS encoding FROM hosted_shared_world_state WHERE state_key='default'")
    return legacy.rows[0] ? SharedWorldService.restore(decodeStoredPayload(legacy.rows[0]) as SharedWorldServiceState).snapshotState() : new SharedWorldService().snapshotState()
  }

  private async loadNormalizedSharedState(client: Pool | PoolClient): Promise<{ state: SharedWorldServiceState; revision: number }> {
    const meta = await client.query<{ revision: string }>("SELECT revision::text FROM hosted_shared_state_meta WHERE state_key='default'")
    const revision = Number(meta.rows[0]?.revision)
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Shared world storage revision is invalid')
    const accounts = (await client.query<any>('SELECT account_id,email,password_hash,created_at FROM hosted_accounts ORDER BY account_id')).rows.map((row: any) => ({ id: row.account_id, email: row.email, passwordHash: row.password_hash, createdAt: iso(row.created_at) }))
    const sessions = (await client.query<any>('SELECT session_id,account_id,token_hash,created_at,expires_at FROM hosted_sessions ORDER BY session_id')).rows.map((row: any) => ({ id: row.session_id, accountId: row.account_id, tokenHash: row.token_hash, createdAt: iso(row.created_at), expiresAt: iso(row.expires_at) }))
    const tokens = (await client.query<any>('SELECT token_id,account_id,token_hash,scopes,created_at,expires_at FROM hosted_api_tokens ORDER BY token_id')).rows.map((row: any) => ({ id: row.token_id, accountId: row.account_id, tokenHash: row.token_hash, scopes: row.scopes, createdAt: iso(row.created_at), ...(row.expires_at ? { expiresAt: iso(row.expires_at) } : {}) }))
    const worlds = (await client.query<any>('SELECT world_id,name,owner_account_id,current_revision,created_at,updated_at FROM hosted_worlds ORDER BY world_id')).rows.map((row: any) => ({ id: row.world_id, name: row.name, ownerAccountId: row.owner_account_id, currentRevision: row.current_revision, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }))
    const access = (await client.query<any>('SELECT world_id,account_id,role FROM hosted_world_access ORDER BY world_id,account_id')).rows.map((row: any) => ({ worldId: row.world_id, accountId: row.account_id, role: row.role }))
    const revisionRows = await client.query<StoredPayload & any>('SELECT world_id,revision,parent_revision,canonical_digest,author_account_id,payload,payload_sha256 AS sha,payload_encoding AS encoding,created_at FROM hosted_world_revisions ORDER BY world_id,revision')
    const revisions = revisionRows.rows.map((row: any) => ({ worldId: row.world_id, revision: row.revision, ...(row.parent_revision === null ? {} : { parentRevision: row.parent_revision }), canonicalDigest: row.canonical_digest, authorAccountId: row.author_account_id, payload: decodeStoredPayload(row), createdAt: iso(row.created_at) }))
    const leases = (await client.query<any>('SELECT world_id,lease_id,holder_account_id,revision,expires_at FROM hosted_world_leases ORDER BY world_id')).rows.map((row: any) => ({ worldId: row.world_id, leaseId: row.lease_id, holderAccountId: row.holder_account_id, revision: row.revision, expiresAt: iso(row.expires_at) }))
    const audits = (await client.query<any>('SELECT audit_id,world_id,actor_account_id,action,revision,created_at FROM hosted_world_audits ORDER BY world_id,audit_id')).rows.map((row: any) => ({ id: row.audit_id, worldId: row.world_id, actorAccountId: row.actor_account_id, action: row.action, revision: row.revision, createdAt: iso(row.created_at) }))
    const runs = (await client.query<any>('SELECT run_id,world_id,revision,owner_account_id,created_at FROM hosted_world_runs ORDER BY run_id')).rows.map((row: any) => ({ runId: row.run_id, worldId: row.world_id, revision: row.revision, ownerAccountId: row.owner_account_id, createdAt: iso(row.created_at) }))
    const mutations = (await client.query<any>('SELECT mutation_key,world_id,revision FROM hosted_shared_mutations ORDER BY mutation_key')).rows.map((row: any) => { const found = revisions.find((entry: any) => entry.worldId === row.world_id && entry.revision === row.revision); if (!found) throw new Error('Shared world mutation references a missing revision'); return { key: row.mutation_key, revision: found } })
    const state: SharedWorldServiceState = { version: 1, accounts, sessions, tokens, worlds, access, revisions, leases, audits, runs, mutations }
    return { state: SharedWorldService.restore(state, revision).snapshotState(), revision }
  }

  private async writeNormalizedSharedState(client: PoolClient, state: SharedWorldServiceState): Promise<void> {
    const valid = SharedWorldService.restore(state).snapshotState()
    for (const table of ['hosted_shared_mutations','hosted_world_audits','hosted_world_leases','hosted_world_runs','hosted_world_access','hosted_world_revisions','hosted_worlds','hosted_api_tokens','hosted_sessions','hosted_accounts']) await client.query(`DELETE FROM ${table}`)
    for (const row of valid.accounts) await client.query('INSERT INTO hosted_accounts(account_id,email,password_hash,created_at) VALUES ($1,$2,$3,$4)', [row.id,row.email,row.passwordHash,row.createdAt])
    for (const row of valid.sessions) await client.query('INSERT INTO hosted_sessions(session_id,account_id,token_hash,created_at,expires_at) VALUES ($1,$2,$3,$4,$5)', [row.id,row.accountId,row.tokenHash,row.createdAt,row.expiresAt])
    for (const row of valid.tokens) await client.query('INSERT INTO hosted_api_tokens(token_id,account_id,token_hash,scopes,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6)', [row.id,row.accountId,row.tokenHash,[...row.scopes],row.createdAt,row.expiresAt ?? null])
    for (const row of valid.worlds) await client.query('INSERT INTO hosted_worlds(world_id,name,owner_account_id,current_revision,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)', [row.id,row.name,row.ownerAccountId,row.currentRevision,row.createdAt,row.updatedAt])
    for (const row of valid.access) await client.query('INSERT INTO hosted_world_access(world_id,account_id,role) VALUES ($1,$2,$3)', [row.worldId,row.accountId,row.role])
    for (const row of valid.revisions) { const payload=encodePayload(row.payload); await client.query('INSERT INTO hosted_world_revisions(world_id,revision,parent_revision,canonical_digest,author_account_id,payload,payload_sha256,payload_uncompressed_bytes,payload_encoding,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [row.worldId,row.revision,row.parentRevision ?? null,row.canonicalDigest,row.authorAccountId,payload.compressed,payload.sha256,payload.uncompressedBytes,PAYLOAD_ENCODING,row.createdAt]) }
    for (const row of valid.leases) await client.query('INSERT INTO hosted_world_leases(world_id,lease_id,holder_account_id,revision,expires_at) VALUES ($1,$2,$3,$4,$5)', [row.worldId,row.leaseId,row.holderAccountId,row.revision,row.expiresAt])
    for (const row of valid.audits) await client.query('INSERT INTO hosted_world_audits(audit_id,world_id,actor_account_id,action,revision,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [row.id,row.worldId,row.actorAccountId,row.action,row.revision,row.createdAt])
    for (const row of valid.runs ?? []) await client.query('INSERT INTO hosted_world_runs(run_id,world_id,revision,owner_account_id,created_at) VALUES ($1,$2,$3,$4,$5)', [row.runId,row.worldId,row.revision,row.ownerAccountId,row.createdAt])
    for (const row of valid.mutations) await client.query('INSERT INTO hosted_shared_mutations(mutation_key,world_id,revision) VALUES ($1,$2,$3)', [row.key,row.revision.worldId,row.revision.revision])
  }

  private async verifyConnection(): Promise<void> { await this.pool.query('SELECT 1') }
  private async saveRun(client: PoolClient, record: HostedRunRecord, payload: EncodedPayload): Promise<void> {
    await client.query(`INSERT INTO hosted_runs(run_id, owner_id, saved_at, snapshot_payload, snapshot_sha256, snapshot_uncompressed_bytes, snapshot_encoding)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (run_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, saved_at = EXCLUDED.saved_at, snapshot_payload = EXCLUDED.snapshot_payload, snapshot_sha256 = EXCLUDED.snapshot_sha256, snapshot_uncompressed_bytes = EXCLUDED.snapshot_uncompressed_bytes, snapshot_encoding = EXCLUDED.snapshot_encoding`,
    [record.runId, record.ownerId, record.savedAt, payload.compressed, payload.sha256, payload.uncompressedBytes, PAYLOAD_ENCODING])
  }
  private async insertTelemetry(client: PoolClient, runId: string, events: readonly SimulationEvent[], statistics: readonly StatisticSample[]): Promise<void> {
    const telemetry = encodePayload({ events: [...events], statistics: [...statistics] }); const ticks = [...events.map((event) => event.tick), ...statistics.map((sample) => sample.tick)]
    await client.query(`INSERT INTO hosted_telemetry_batches(run_id, first_tick, last_tick, event_count, statistic_count, payload, payload_sha256, payload_uncompressed_bytes, payload_encoding) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [runId, Math.min(...ticks), Math.max(...ticks), events.length, statistics.length, telemetry.compressed, telemetry.sha256, telemetry.uncompressedBytes, PAYLOAD_ENCODING])
  }
}

interface EncodedPayload { compressed: Buffer; sha256: string; uncompressedBytes: number }
interface StoredPayload { payload: Buffer; sha: string; encoding: string }
const PAYLOAD_ENCODING = 'gzip-json-v1'
const SHARED_BLOB_TABLES = ['hosted_accounts', 'hosted_sessions', 'hosted_api_tokens', 'hosted_worlds', 'hosted_world_access', 'hosted_world_revisions', 'hosted_world_leases', 'hosted_world_audits', 'hosted_world_runs', 'hosted_shared_mutations'] as const
export function encodePayload(value: unknown): EncodedPayload {
  const raw = Buffer.from(canonicalStringify(value), 'utf8')
  return { compressed: gzipSync(raw), sha256: createHash('sha256').update(raw).digest('hex'), uncompressedBytes: raw.byteLength }
}
export function decodePayload(payload: Buffer, expectedSha256: string): unknown {
  const raw = gunzipSync(payload)
  const actual = createHash('sha256').update(raw).digest('hex')
  if (actual !== expectedSha256) throw new Error('Hosted persisted payload checksum does not match')
  return JSON.parse(raw.toString('utf8')) as unknown
}
function decodeStoredPayload(payload: StoredPayload): unknown {
  if (payload.encoding !== PAYLOAD_ENCODING) throw new Error(`Hosted persisted payload encoding is unsupported: ${payload.encoding}`)
  return decodePayload(payload.payload, payload.sha)
}
function iso(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString() }
function sharedStateFingerprint(state: SharedWorldServiceState): string {
  const sorted = Object.fromEntries(Object.entries(state).map(([key, value]) => [key, Array.isArray(value) ? [...value].sort((left, right) => compareStableText(canonicalStringify(left), canonicalStringify(right))) : value]))
  return createHash('sha256').update(canonicalStringify(sorted)).digest('hex')
}
