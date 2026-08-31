import type { SimulationEvent, StatisticSample, WorldCreationDraft } from '../simulation/domain/types'
import type { WorkbenchProjection } from '../projection'
import type { HostedRunCommand, SimulationResponse, WorkbenchSnapshotEnvelope } from '../runtime/contracts'
import type { SharedWorldCommitRequest, SharedWorldCommitResult } from './sharedWorlds'
import type { ResolvedContentPack } from '../contentPacks'
import { schema, type Infer } from '../shared/schema'

/** Versioned, owner-authorized wire contract for the initial single-node host. */
export const HOSTED_PROTOCOL_VERSION = 1

const stableId = schema.string({ minLength: 1, pattern: '^[a-zA-Z0-9_-]+$' })
const positiveInteger = schema.number({ integer: true, minimum: 1 })
const nonNegativeInteger = schema.number({ integer: true, minimum: 0 })
const snapshotCodec = schema.custom<WorkbenchSnapshotEnvelope>({ type: 'object', required: ['digest', 'state'] }, (value, path) => {
  if (!isWorkbenchSnapshotEnvelope(value)) throw new Error(`${path} must be a snapshot envelope`)
  return structuredClone(value)
})

export const HOSTED_RUN_RECORD_CODEC = schema.object({
  protocolVersion: schema.literal(HOSTED_PROTOCOL_VERSION), runId: stableId, ownerId: stableId,
  savedAt: schema.string({ minLength: 1 }), snapshot: snapshotCodec,
})
export type HostedRunRecord = Infer<typeof HOSTED_RUN_RECORD_CODEC>

/** Durability is injected so tests do not require a filesystem or web server. */
export interface HostedRunStore {
  load(runId: string): Promise<HostedRunRecord | undefined>
  save(record: HostedRunRecord): Promise<void>
  list(ownerId: string): Promise<HostedRunRecord[]>
}

/** Optional durable telemetry boundary. PostgreSQL implements this atomically with a run snapshot. */
export interface HostedTelemetryStore {
  saveWithTelemetry(record: HostedRunRecord, events: readonly SimulationEvent[], statistics: readonly StatisticSample[]): Promise<void>
}

/** A compare-and-swap mutation is the hosted authority boundary. Implementations
 * commit the run, telemetry, and optional job transition as one durable unit. */
export interface HostedRunMutation {
  expectedTick: number
  expectedDigest: string
  mutationId: string
  mutationFingerprint: string
  record: HostedRunRecord
  events: readonly SimulationEvent[]
  statistics: readonly StatisticSample[]
  job?: HostedSimulationJob
  sharedWorld?: Omit<SharedWorldCommitRequest, 'initialRun'>
}

export interface HostedRunMutationResult {
  outcome: 'committed' | 'already-committed'
  sharedWorld?: SharedWorldCommitResult
}
export interface HostedRunMutationStore {
  commitRunMutation(mutation: HostedRunMutation): Promise<HostedRunMutationResult>
}

export interface HostedRunBootstrap {
  runId: string
  ownerId: string
  ownerToken: string
  creation: WorldCreationDraft
  /** Resolved at admission; retained for reset and durable restoration. */
  contentPack?: ResolvedContentPack
}

/** Browser/server clients never send raw state—only this constrained command set. */
export type { HostedRunCommand } from '../runtime/contracts'

export interface HostedCommandResult {
  protocolVersion: typeof HOSTED_PROTOCOL_VERSION
  runId: string
  observedTick: number
  responses: SimulationResponse[]
}

export interface HostedRunView {
  protocolVersion: typeof HOSTED_PROTOCOL_VERSION
  runId: string
  observedTick: number
  projection: WorkbenchProjection
}

export interface HostedRunSummary { runId: string; ownerId: string; tick: number; savedAt: string }

/** Durable, inspectable progress for a host-owned bounded advancement job. */
export const HOSTED_JOB_VERSION = 3
export type HostedJobStatus = 'queued' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed'

export interface HostedJobFailure {
  code: 'run-state-conflict' | 'advance-failed' | 'persistence-failed'
  message: string
}

/** A durable write-ahead record makes restart reconciliation attributable to one job quantum. */
export interface HostedPendingQuantum {
  expectedTick: number
  expectedDigest: string
  ticks: number
}

const pendingQuantumCodec = schema.object({ expectedTick: nonNegativeInteger, expectedDigest: schema.string({ minLength: 1 }), ticks: positiveInteger })
const jobFailureCodec = schema.object({ code: schema.enum(['run-state-conflict', 'advance-failed', 'persistence-failed']), message: schema.string() })
export const HOSTED_JOB_RECORD_CODEC = schema.object({
  version: schema.literal(HOSTED_JOB_VERSION), recordRevision: positiveInteger,
  jobId: stableId, runId: stableId, ownerId: stableId,
  status: schema.enum(['queued', 'running', 'cancelling', 'cancelled', 'completed', 'failed']),
  queueOrder: positiveInteger, startTick: nonNegativeInteger, totalTicks: positiveInteger,
  advancedTicks: nonNegativeInteger, committedTick: nonNegativeInteger, committedDigest: schema.string({ minLength: 1 }),
  pendingQuantum: schema.optional(pendingQuantumCodec), failure: schema.optional(jobFailureCodec),
  quantumTicks: positiveInteger, checkpointIntervalTicks: positiveInteger, lastCheckpointTick: nonNegativeInteger,
  createdAt: schema.string({ minLength: 1 }), updatedAt: schema.string({ minLength: 1 }),
})
export type HostedSimulationJob = Infer<typeof HOSTED_JOB_RECORD_CODEC>

/** Job durability is deliberately separate from run snapshots. */
export interface HostedJobStore {
  loadJob(runId: string, jobId: string): Promise<HostedSimulationJob | undefined>
  saveJob(job: HostedSimulationJob, expectedRecordRevision: number): Promise<void>
  listJobs(runId: string): Promise<HostedSimulationJob[]>
}

/** Validate host persistence at every trust boundary; do not cast parsed JSON into authority. */
export function validateHostedRunRecord(value: unknown): HostedRunRecord {
  try { return HOSTED_RUN_RECORD_CODEC.decode(value, 'hostedRun') }
  catch { throw new Error('Hosted run record is invalid') }
}

export function validateHostedJob(value: unknown): HostedSimulationJob {
  let job: HostedSimulationJob
  try { job = HOSTED_JOB_RECORD_CODEC.decode(value, 'hostedJob') }
  catch { throw new Error('Hosted job record is invalid') }
  if (job.advancedTicks > job.totalTicks || job.committedTick < job.startTick || job.lastCheckpointTick < job.startTick) throw new Error('Hosted job ticks are invalid')
  return job
}

function isWorkbenchSnapshotEnvelope(value: unknown): value is WorkbenchSnapshotEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const snapshot = value as Record<string, unknown>
  if (typeof snapshot.digest !== 'string' || typeof snapshot.state !== 'object' || snapshot.state === null || Array.isArray(snapshot.state)) return false
  const state = snapshot.state as Record<string, unknown>
  return typeof state.tick === 'number' && Number.isSafeInteger(state.tick) && state.tick >= 0
}
