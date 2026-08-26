import type { SimulationEvent, StatisticSample, WorldCreationDraft } from '../simulation/domain/types'
import type { WorkbenchProjection } from '../projection'
import type { SimulationCommand, SimulationResponse, WorkbenchSnapshotEnvelope } from '../worker/protocol'

/** Versioned, owner-authorized wire contract for the initial single-node host. */
export const HOSTED_PROTOCOL_VERSION = 1

export interface HostedRunRecord {
  protocolVersion: typeof HOSTED_PROTOCOL_VERSION
  runId: string
  ownerId: string
  savedAt: string
  snapshot: WorkbenchSnapshotEnvelope
}

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

export interface HostedRunBootstrap {
  runId: string
  ownerId: string
  ownerToken: string
  creation: WorldCreationDraft
}

/** Browser/server clients never send raw state—only this constrained command set. */
export type HostedRunCommand = Extract<SimulationCommand,
  | { type: 'STEP' }
  | { type: 'PAUSE' }
  | { type: 'SET_SPEED' }
  | { type: 'SET_VIEWPORT' }
  | { type: 'REQUEST_SNAPSHOT' }
  | { type: 'RESET' }
>

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
export const HOSTED_JOB_VERSION = 2
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

export interface HostedSimulationJob {
  version: typeof HOSTED_JOB_VERSION
  jobId: string
  runId: string
  ownerId: string
  status: HostedJobStatus
  queueOrder: number
  startTick: number
  totalTicks: number
  advancedTicks: number
  committedTick: number
  committedDigest: string
  pendingQuantum?: HostedPendingQuantum
  failure?: HostedJobFailure
  quantumTicks: number
  checkpointIntervalTicks: number
  lastCheckpointTick: number
  createdAt: string
  updatedAt: string
}

/** Job durability is deliberately separate from run snapshots. */
export interface HostedJobStore {
  loadJob(runId: string, jobId: string): Promise<HostedSimulationJob | undefined>
  saveJob(job: HostedSimulationJob): Promise<void>
  listJobs(runId: string): Promise<HostedSimulationJob[]>
}

/** Validate host persistence at every trust boundary; do not cast parsed JSON into authority. */
export function validateHostedRunRecord(value: unknown): HostedRunRecord {
  if (!isRecord(value) || value.protocolVersion !== HOSTED_PROTOCOL_VERSION || !validId(value.runId) || !validId(value.ownerId)
    || typeof value.savedAt !== 'string' || !isRecord(value.snapshot) || typeof value.snapshot.digest !== 'string'
    || !isRecord(value.snapshot.state) || !nonNegativeInteger(value.snapshot.state.tick)) {
    throw new Error('Hosted run record is invalid')
  }
  return value as unknown as HostedRunRecord
}

export function validateHostedJob(value: unknown): HostedSimulationJob {
  if (!isRecord(value) || value.version !== HOSTED_JOB_VERSION || !validId(value.jobId) || !validId(value.runId) || !validId(value.ownerId)
    || !isHostedJobStatus(value.status) || !positiveInteger(value.queueOrder) || !nonNegativeInteger(value.startTick)
    || !positiveInteger(value.totalTicks) || !nonNegativeInteger(value.advancedTicks) || value.advancedTicks > value.totalTicks
    || !nonNegativeInteger(value.committedTick) || typeof value.committedDigest !== 'string' || value.committedDigest.length === 0
    || !positiveInteger(value.quantumTicks) || !positiveInteger(value.checkpointIntervalTicks)
    || !nonNegativeInteger(value.lastCheckpointTick) || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
    throw new Error('Hosted job record is invalid')
  }
  if (value.pendingQuantum !== undefined && (!isRecord(value.pendingQuantum) || !nonNegativeInteger(value.pendingQuantum.expectedTick)
    || typeof value.pendingQuantum.expectedDigest !== 'string' || value.pendingQuantum.expectedDigest.length === 0
    || !positiveInteger(value.pendingQuantum.ticks))) throw new Error('Hosted job pending quantum is invalid')
  if (value.failure !== undefined && (!isRecord(value.failure) || !isHostedJobFailureCode(value.failure.code) || typeof value.failure.message !== 'string')) {
    throw new Error('Hosted job failure is invalid')
  }
  if (value.committedTick < value.startTick || value.lastCheckpointTick < value.startTick) throw new Error('Hosted job ticks are invalid')
  return value as unknown as HostedSimulationJob
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function validId(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value) }
function nonNegativeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
function positiveInteger(value: unknown): value is number { return nonNegativeInteger(value) && value > 0 }
function isHostedJobStatus(value: unknown): value is HostedJobStatus { return value === 'queued' || value === 'running' || value === 'cancelling' || value === 'cancelled' || value === 'completed' || value === 'failed' }
function isHostedJobFailureCode(value: unknown): value is HostedJobFailure['code'] { return value === 'run-state-conflict' || value === 'advance-failed' || value === 'persistence-failed' }
