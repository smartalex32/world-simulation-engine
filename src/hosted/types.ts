import type { WorldCreationDraft } from '../simulation/domain/types'
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
export const HOSTED_JOB_VERSION = 1
export type HostedJobStatus = 'queued' | 'running' | 'cancelled' | 'completed'
export interface HostedSimulationJob {
  version: typeof HOSTED_JOB_VERSION
  jobId: string
  runId: string
  ownerId: string
  status: HostedJobStatus
  startTick: number
  totalTicks: number
  advancedTicks: number
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
