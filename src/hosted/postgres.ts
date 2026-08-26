import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { Pool, type PoolClient } from 'pg'
import type { SimulationEvent, StatisticSample } from '../simulation/domain/types'
import { canonicalStringify } from '../simulation/serialization/snapshot'
import { compareStableText } from '../shared/stableOrder'
import { validateHostedJob, validateHostedRunRecord, type HostedJobStore, type HostedRunRecord, type HostedRunStore, type HostedSimulationJob, type HostedTelemetryStore } from './types'

/** Current hosted database generation; migrations retain the two prior generations. */
export const DATABASE_MIGRATION_VERSION = 3

/**
 * PostgreSQL durable store. Payload bytes are canonical JSON compressed with
 * gzip and integrity checked before validation. Timestamps are operational
 * metadata and are never part of a simulation digest.
 */
export class PostgresHostedRunStore implements HostedRunStore, HostedJobStore, HostedTelemetryStore {
  constructor(readonly pool: Pool) {}

  static async connect(connectionString: string): Promise<PostgresHostedRunStore> {
    const pool = new Pool({ connectionString })
    const store = new PostgresHostedRunStore(pool)
    await store.verifyConnection()
    return store
  }

  async close(): Promise<void> { await this.pool.end() }

  async assertReady(): Promise<void> {
    const result = await this.pool.query<{ version: number }>('SELECT version FROM world_simulation_schema_migrations ORDER BY version DESC LIMIT 1')
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
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  async load(runId: string): Promise<HostedRunRecord | undefined> {
    const result = await this.pool.query<{ payload: Buffer; sha: string }>('SELECT snapshot_payload AS payload, snapshot_sha256 AS sha FROM hosted_runs WHERE run_id = $1', [runId])
    return result.rows[0] ? validateHostedRunRecord(decodePayload(result.rows[0].payload, result.rows[0].sha)) : undefined
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
        await client.query(`INSERT INTO hosted_telemetry_batches(run_id, first_tick, last_tick, event_count, statistic_count, payload, payload_sha256, payload_uncompressed_bytes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [valid.runId, Math.min(...ticks), Math.max(...ticks), events.length, statistics.length, telemetry.compressed, telemetry.sha256, telemetry.uncompressedBytes])
      }
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  async list(ownerId: string): Promise<HostedRunRecord[]> {
    const result = await this.pool.query<{ payload: Buffer; sha: string }>('SELECT snapshot_payload AS payload, snapshot_sha256 AS sha FROM hosted_runs WHERE owner_id = $1 ORDER BY run_id ASC', [ownerId])
    return result.rows.map((row) => validateHostedRunRecord(decodePayload(row.payload, row.sha))).sort((a, b) => compareStableText(a.runId, b.runId))
  }

  async loadJob(runId: string, jobId: string): Promise<HostedSimulationJob | undefined> {
    const result = await this.pool.query<{ payload: Buffer; sha: string }>('SELECT payload, payload_sha256 AS sha FROM hosted_jobs WHERE run_id = $1 AND job_id = $2', [runId, jobId])
    return result.rows[0] ? validateHostedJob(decodePayload(result.rows[0].payload, result.rows[0].sha)) : undefined
  }

  async saveJob(job: HostedSimulationJob): Promise<void> {
    const valid = validateHostedJob(job); const payload = encodePayload(valid)
    await this.pool.query(`INSERT INTO hosted_jobs(run_id, job_id, owner_id, status, queue_order, updated_at, payload, payload_sha256, payload_uncompressed_bytes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (run_id, job_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, status = EXCLUDED.status, queue_order = EXCLUDED.queue_order, updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload, payload_sha256 = EXCLUDED.payload_sha256, payload_uncompressed_bytes = EXCLUDED.payload_uncompressed_bytes`,
    [valid.runId, valid.jobId, valid.ownerId, valid.status, valid.queueOrder, valid.updatedAt, payload.compressed, payload.sha256, payload.uncompressedBytes])
  }

  async listJobs(runId: string): Promise<HostedSimulationJob[]> {
    const result = await this.pool.query<{ payload: Buffer; sha: string }>('SELECT payload, payload_sha256 AS sha FROM hosted_jobs WHERE run_id = $1 ORDER BY queue_order ASC, job_id ASC', [runId])
    return result.rows.map((row) => validateHostedJob(decodePayload(row.payload, row.sha))).sort((a, b) => a.queueOrder - b.queueOrder || compareStableText(a.jobId, b.jobId))
  }

  private async verifyConnection(): Promise<void> { await this.pool.query('SELECT 1') }
  private async saveRun(client: PoolClient, record: HostedRunRecord, payload: EncodedPayload): Promise<void> {
    await client.query(`INSERT INTO hosted_runs(run_id, owner_id, saved_at, snapshot_payload, snapshot_sha256, snapshot_uncompressed_bytes)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (run_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, saved_at = EXCLUDED.saved_at, snapshot_payload = EXCLUDED.snapshot_payload, snapshot_sha256 = EXCLUDED.snapshot_sha256, snapshot_uncompressed_bytes = EXCLUDED.snapshot_uncompressed_bytes`,
    [record.runId, record.ownerId, record.savedAt, payload.compressed, payload.sha256, payload.uncompressedBytes])
  }
}

interface EncodedPayload { compressed: Buffer; sha256: string; uncompressedBytes: number }
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
