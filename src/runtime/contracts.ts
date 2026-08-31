import type { MapProjectionRequest, ProjectionInvalidation, WorkbenchProjection } from '../projection'
import type { DraftViewportProjection, DraftViewportRequest, SimulationEvent, SnapshotEnvelope, StatisticSample, Terrain, WorldCreationDraft, WorldDraftPreview, WorldDraftRecord } from '../simulation/domain/types'
import type { ContentPack, ResolvedContentPack } from '../contentPacks'

/** Platform-neutral continuation metadata. It is deliberately excluded from
 * canonical engine state and may be ignored by hosted adapters. */
export interface RuntimeContinuationState {
  version: 1
  ticksPerBatch: number
  batch: { remaining: number; advanced: number }
}

export type WorkbenchSnapshotEnvelope = SnapshotEnvelope & { workerContinuation?: RuntimeContinuationState }

/** The application command contract is owned by runtime, not either adapter. */
export type SimulationCommand =
  | { type: 'CREATE_RUN'; requestId: string; creation: WorldCreationDraft; contentPack?: ContentPack | ResolvedContentPack }
  | { type: 'CREATE_DRAFT'; requestId: string; draftId: string; draft: WorldCreationDraft }
  | { type: 'HYDRATE_DRAFT'; requestId: string; draft: WorldDraftRecord }
  | { type: 'UPDATE_DRAFT'; requestId: string; draftId: string; draft: WorldCreationDraft; expectedRevision?: number }
  | { type: 'UPDATE_DRAFT_ZONE_CELLS'; requestId: string; draftId: string; zoneId: string; cellIds: string[]; expectedRevision?: number }
  | { type: 'PAINT_DRAFT_TERRAIN'; requestId: string; draftId: string; cellIds: string[]; terrain: Terrain; expectedRevision?: number }
  | { type: 'PAINT_DRAFT_ELEVATION'; requestId: string; draftId: string; cellIds: string[]; elevation: number; expectedRevision?: number }
  | { type: 'PAINT_DRAFT_RESOURCES'; requestId: string; draftId: string; cellIds: string[]; resourceCapacity: number; expectedRevision?: number }
  | { type: 'UNDO_DRAFT'; requestId: string; draftId: string; expectedRevision?: number }
  | { type: 'REDO_DRAFT'; requestId: string; draftId: string; expectedRevision?: number }
  | { type: 'RESET_DRAFT'; requestId: string; draftId: string; expectedRevision?: number }
  | { type: 'REQUEST_DRAFT_PREVIEW'; requestId: string; draftId: string }
  | { type: 'REQUEST_DRAFT_VIEWPORT'; requestId: string; draftId: string; viewport: DraftViewportRequest }
  | { type: 'COMMIT_DRAFT'; requestId: string; draftId: string; expectedRevision?: number; contentPack?: ContentPack | ResolvedContentPack }
  | { type: 'DISCARD_DRAFT'; requestId: string; draftId: string }
  | { type: 'LOAD_RUN'; requestId: string; snapshot: WorkbenchSnapshotEnvelope; contentPack?: ContentPack | ResolvedContentPack }
  | { type: 'STEP'; requestId: string; count?: number }
  | { type: 'MATERIALIZE_COHORT'; requestId: string; cohortId: string; populationCount: number }
  | { type: 'DEMATERIALIZE_PEOPLE'; requestId: string; personIds: string[] }
  | { type: 'SET_PROTECTED_PEOPLE'; requestId: string; personIds: string[] }
  | { type: 'PLAY'; requestId: string; ticksPerBatch: number }
  | { type: 'PAUSE'; requestId: string }
  | { type: 'SET_SPEED'; requestId: string; ticksPerBatch: number }
  | { type: 'SET_VIEWPORT'; requestId: string; viewport: MapProjectionRequest }
  | { type: 'REQUEST_SNAPSHOT'; requestId: string }
  | { type: 'RESET'; requestId: string }
  | { type: 'DISPOSE'; requestId: string }

export type EngineCommand = Extract<SimulationCommand, { type: 'STEP' | 'MATERIALIZE_COHORT' | 'DEMATERIALIZE_PEOPLE' | 'SET_PROTECTED_PEOPLE' }>
export type HostedRunCommand = Extract<SimulationCommand, { type: 'STEP' | 'MATERIALIZE_COHORT' | 'DEMATERIALIZE_PEOPLE' | 'SET_PROTECTED_PEOPLE' | 'PAUSE' | 'SET_SPEED' | 'SET_VIEWPORT' | 'REQUEST_SNAPSHOT' | 'RESET' }>
export type CommandAcknowledgement<C extends SimulationCommand = SimulationCommand> = { type: 'ACK'; requestId: C['requestId']; command: C['type'] }

export type SimulationResponse =
  | { type: 'READY' }
  | CommandAcknowledgement
  | { type: 'FRAME'; requestId?: string; projection: WorkbenchProjection; events: SimulationEvent[]; statistics: StatisticSample[]; processingMs: number; projectionInvalidation: ProjectionInvalidation }
  | { type: 'STATUS'; requestId?: string; status: 'idle' | 'paused' | 'playing'; ticksPerBatch: number }
  | { type: 'DRAFT'; requestId: string; action: 'created' | 'hydrated' | 'updated' | 'zoneCellsUpdated' | 'terrainPainted' | 'elevationPainted' | 'resourcesPainted' | 'undone' | 'redone' | 'reset' | 'previewed' | 'committing' | 'committed' | 'discarded'; draft?: WorldDraftRecord; preview?: WorldDraftPreview }
  | { type: 'DRAFT_VIEWPORT'; requestId: string; viewport: DraftViewportProjection }
  | { type: 'SNAPSHOT'; requestId: string; snapshot: WorkbenchSnapshotEnvelope }
  | { type: 'ERROR'; requestId?: string; message: string; stack?: string }

export function requestId(): string {
  return `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0]?.toString(36)}`
}
