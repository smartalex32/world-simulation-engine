import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { Pool, type PoolClient } from 'pg'
import type { SimulationEvent, StatisticSample } from '../simulation/domain/types'
import { canonicalStringify } from '../simulation/serialization/snapshot'
import { compareStableText } from '../shared/stableOrder'
import { exportContentPack, importContentPack, type ContentPack, type ContentPackCatalog } from '../contentPacks'
import { validateHostedJob, validateHostedRunRecord, type HostedJobStore, type HostedRunMutation, type HostedRunMutationStore, type HostedRunRecord, type HostedRunStore, type HostedSimulationJob, type HostedTelemetryStore } from './types'
import { SharedWorldService, type SharedWorldServiceState } from './sharedWorlds'
import { HostedEventStream, type HostedEventStreamState } from './eventStream'

/** Current hosted database generation; migrations retain the two prior generations. */
export const DATABASE_MIGRATION_VERSION = 7

/**
 * PostgreSQL durable store. Payload bytes are canonical JSON compressed with
 * gzip and integrity checked before validation. Timestamps are operational
 * metadata and are never part of a simulation digest.
 */
export class PostgresHostedRunStore implements HostedRunStore, HostedJobStore, HostedTelemetryStore, HostedRunMutationStore, ContentPackCatalog {
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

  /** Locks the durable row before checking the candidate's exact parent state.
   * Nothing becomes visible until snapshot, telemetry, job, and mutation ID commit. */
  async commitRunMutation(mutation: HostedRunMutation): Promise<'committed' | 'already-committed'> {
    const valid = validateHostedRunRecord(mutation.record)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const existing = await client.query<{ snapshot_digest: string }>('SELECT snapshot_digest FROM hosted_run_mutations WHERE run_id = $1 AND mutation_id = $2 FOR UPDATE', [valid.runId, mutation.mutationId])
      if (existing.rows[0]) {
        await client.query('COMMIT'); return 'already-committed'
      }
      const current = await client.query<StoredPayload>('SELECT snapshot_payload AS payload, snapshot_sha256 AS sha, snapshot_encoding AS encoding FROM hosted_runs WHERE run_id = $1 FOR UPDATE', [valid.runId])
      if (!current.rows[0]) throw new Error('Hosted run state conflict')
      const currentRecord = validateHostedRunRecord(decodeStoredPayload(current.rows[0]))
      if (currentRecord.snapshot.state.tick !== mutation.expectedTick || currentRecord.snapshot.digest !== mutation.expectedDigest) throw new Error('Hosted job run state conflict')
      await this.saveRun(client, valid, encodePayload(valid))
      if (mutation.events.length || mutation.statistics.length) await this.insertTelemetry(client, valid.runId, mutation.events, mutation.statistics)
      if (mutation.job) await this.saveJobWithClient(client, mutation.job)
      await client.query('INSERT INTO hosted_run_mutations(run_id, mutation_id, snapshot_digest) VALUES ($1,$2,$3)', [valid.runId, mutation.mutationId, valid.snapshot.digest])
      await client.query('COMMIT'); return 'committed'
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

  async saveJob(job: HostedSimulationJob): Promise<void> {
    await this.saveJobWithClient(this.pool, job)
  }
  private async saveJobWithClient(client: Pool | PoolClient, job: HostedSimulationJob): Promise<void> {
    const valid = validateHostedJob(job); const payload = encodePayload(valid)
    await client.query(`INSERT INTO hosted_jobs(run_id, job_id, owner_id, status, queue_order, updated_at, payload, payload_sha256, payload_uncompressed_bytes, payload_encoding)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (run_id, job_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, status = EXCLUDED.status, queue_order = EXCLUDED.queue_order, updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload, payload_sha256 = EXCLUDED.payload_sha256, payload_uncompressed_bytes = EXCLUDED.payload_uncompressed_bytes, payload_encoding = EXCLUDED.payload_encoding`,
    [valid.runId, valid.jobId, valid.ownerId, valid.status, valid.queueOrder, valid.updatedAt, payload.compressed, payload.sha256, payload.uncompressedBytes, PAYLOAD_ENCODING])
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
    const result = await this.pool.query<StoredPayload>('SELECT payload, payload_sha256 AS sha, payload_encoding AS encoding FROM hosted_shared_world_state WHERE state_key = $1', ['default'])
    return result.rows[0] ? SharedWorldService.restore(decodeStoredPayload(result.rows[0]) as SharedWorldServiceState) : new SharedWorldService()
  }
  async saveSharedWorldService(service: SharedWorldService): Promise<void> {
    const payload = encodePayload(service.snapshotState())
    await this.pool.query(`INSERT INTO hosted_shared_world_state(state_key, payload, payload_sha256, payload_uncompressed_bytes, payload_encoding)
      VALUES ('default',$1,$2,$3,$4) ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, payload_sha256 = EXCLUDED.payload_sha256, payload_uncompressed_bytes = EXCLUDED.payload_uncompressed_bytes, payload_encoding = EXCLUDED.payload_encoding, saved_at = now()`, [payload.compressed, payload.sha256, payload.uncompressedBytes, PAYLOAD_ENCODING])
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
