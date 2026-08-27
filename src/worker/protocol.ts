import type { MapProjectionRequest, WorkbenchProjection } from '../projection'
import type { DraftViewportProjection, DraftViewportRequest, SimulationEvent, SnapshotEnvelope, StatisticSample, Terrain, WorldCreationDraft, WorldDraftPreview, WorldDraftRecord } from '../simulation/domain/types'
import type { WorkerContinuationState } from './frameScheduler'
import type { ContentPack } from '../contentPacks'

export type WorkbenchSnapshotEnvelope = SnapshotEnvelope & { workerContinuation?: WorkerContinuationState }

export type SimulationCommand =
  | { type: 'CREATE_RUN'; requestId: string; creation: WorldCreationDraft; contentPack?: ContentPack }
  | { type: 'CREATE_DRAFT'; requestId: string; draftId: string; draft: WorldCreationDraft }
  | { type: 'HYDRATE_DRAFT'; requestId: string; draft: WorldDraftRecord }
  | { type: 'UPDATE_DRAFT'; requestId: string; draftId: string; draft: WorldCreationDraft; expectedRevision?: number }
  | { type: 'UPDATE_DRAFT_ZONE_CELLS'; requestId: string; draftId: string; zoneId: string; cellIds: string[]; expectedRevision?: number }
  | { type: 'PAINT_DRAFT_TERRAIN'; requestId: string; draftId: string; cellIds: string[]; terrain: Terrain; expectedRevision?: number }
  | { type: 'PAINT_DRAFT_ELEVATION'; requestId: string; draftId: string; cellIds: string[]; elevation: number; expectedRevision?: number }
  | { type: 'PAINT_DRAFT_RESOURCES'; requestId: string; draftId: string; cellIds: string[]; resourceCapacity: number; expectedRevision?: number }
  | { type: 'RESET_DRAFT'; requestId: string; draftId: string; expectedRevision?: number }
  | { type: 'REQUEST_DRAFT_PREVIEW'; requestId: string; draftId: string }
  | { type: 'REQUEST_DRAFT_VIEWPORT'; requestId: string; draftId: string; viewport: DraftViewportRequest }
  | { type: 'COMMIT_DRAFT'; requestId: string; draftId: string; expectedRevision?: number; contentPack?: ContentPack }
  | { type: 'DISCARD_DRAFT'; requestId: string; draftId: string }
  | { type: 'LOAD_RUN'; requestId: string; snapshot: WorkbenchSnapshotEnvelope; contentPack?: ContentPack }
  | { type: 'STEP'; requestId: string; count?: number }
  | { type: 'PLAY'; requestId: string; ticksPerBatch: number }
  | { type: 'PAUSE'; requestId: string }
  | { type: 'SET_SPEED'; requestId: string; ticksPerBatch: number }
  | { type: 'SET_VIEWPORT'; requestId: string; viewport: MapProjectionRequest }
  | { type: 'REQUEST_SNAPSHOT'; requestId: string }
  | { type: 'RESET'; requestId: string }
  | { type: 'DISPOSE'; requestId: string }

export type SimulationResponse =
  | { type: 'READY' }
  | { type: 'FRAME'; requestId?: string; projection: WorkbenchProjection; events: SimulationEvent[]; statistics: StatisticSample[]; processingMs: number }
  | { type: 'STATUS'; requestId?: string; status: 'idle' | 'paused' | 'playing'; ticksPerBatch: number }
  | { type: 'DRAFT'; requestId: string; action: 'created' | 'hydrated' | 'updated' | 'zoneCellsUpdated' | 'terrainPainted' | 'elevationPainted' | 'resourcesPainted' | 'reset' | 'previewed' | 'committing' | 'committed' | 'discarded'; draft?: WorldDraftRecord; preview?: WorldDraftPreview }
  | { type: 'DRAFT_VIEWPORT'; requestId: string; viewport: DraftViewportProjection }
  | { type: 'SNAPSHOT'; requestId: string; snapshot: WorkbenchSnapshotEnvelope }
  | { type: 'ERROR'; requestId?: string; message: string; stack?: string }

export function requestId(): string {
  return `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0]?.toString(36)}`
}
