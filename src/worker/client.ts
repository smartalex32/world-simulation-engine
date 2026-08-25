import type { MapProjectionRequest } from '../projection'
import type { DraftViewportRequest, Terrain, WorldCreationDraft, WorldDraftRecord } from '../simulation/domain/types'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { requestId, type SimulationCommand, type SimulationResponse, type WorkbenchSnapshotEnvelope } from './protocol'

type Listener = (response: SimulationResponse) => void

export class SimulationWorkerClient {
  private readonly worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' })
  private readonly listeners = new Set<Listener>()
  private readonly pendingSnapshots = new Map<string, { resolve: (snapshot: WorkbenchSnapshotEnvelope) => void; reject: (error: Error) => void }>()
  private ready = false

  constructor() {
    this.worker.addEventListener('message', (event: MessageEvent<SimulationResponse>) => {
      const response = event.data
      if (response.type === 'READY') this.ready = true
      if (response.type === 'SNAPSHOT') {
        const pending = this.pendingSnapshots.get(response.requestId)
        if (pending) {
          this.pendingSnapshots.delete(response.requestId)
          pending.resolve(response.snapshot)
        }
      }
      if (response.type === 'ERROR' && response.requestId) {
        const pending = this.pendingSnapshots.get(response.requestId)
        if (pending) {
          this.pendingSnapshots.delete(response.requestId)
          pending.reject(new Error(response.message))
        }
      }
      for (const listener of this.listeners) listener(response)
    })
    this.worker.addEventListener('error', (event) => {
      this.rejectPending(new Error(`Simulation worker crashed: ${event.message || 'unknown error'}`))
      const response: SimulationResponse = { type: 'ERROR', message: event.message }
      for (const listener of this.listeners) listener(response)
    })
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    if (this.ready) queueMicrotask(() => {
      if (this.listeners.has(listener)) listener({ type: 'READY' })
    })
    return () => this.listeners.delete(listener)
  }

  create(creation: WorldCreationDraft | string): void { this.send({ type: 'CREATE_RUN', requestId: requestId(), creation: typeof creation === 'string' ? defaultWorldCreationRequest(creation) : creation }) }
  createDraft(draftId: string, draft: WorldCreationDraft): void { this.send({ type: 'CREATE_DRAFT', requestId: requestId(), draftId, draft }) }
  hydrateDraft(draft: WorldDraftRecord): void { this.send({ type: 'HYDRATE_DRAFT', requestId: requestId(), draft }) }
  updateDraft(draftId: string, draft: WorldCreationDraft, expectedRevision?: number): void { this.send({ type: 'UPDATE_DRAFT', requestId: requestId(), draftId, draft, expectedRevision }) }
  updateDraftZoneCells(draftId: string, zoneId: string, cellIds: string[], expectedRevision?: number): void { this.send({ type: 'UPDATE_DRAFT_ZONE_CELLS', requestId: requestId(), draftId, zoneId, cellIds, expectedRevision }) }
  paintDraftTerrain(draftId: string, cellIds: string[], terrain: Terrain, expectedRevision?: number): void { this.send({ type: 'PAINT_DRAFT_TERRAIN', requestId: requestId(), draftId, cellIds, terrain, expectedRevision }) }
  paintDraftElevation(draftId: string, cellIds: string[], elevation: number, expectedRevision?: number): void { this.send({ type: 'PAINT_DRAFT_ELEVATION', requestId: requestId(), draftId, cellIds, elevation, expectedRevision }) }
  paintDraftResources(draftId: string, cellIds: string[], resourceCapacity: number, expectedRevision?: number): void { this.send({ type: 'PAINT_DRAFT_RESOURCES', requestId: requestId(), draftId, cellIds, resourceCapacity, expectedRevision }) }
  resetDraft(draftId: string, expectedRevision?: number): void { this.send({ type: 'RESET_DRAFT', requestId: requestId(), draftId, expectedRevision }) }
  previewDraft(draftId: string): void { this.send({ type: 'REQUEST_DRAFT_PREVIEW', requestId: requestId(), draftId }) }
  requestDraftViewport(draftId: string, viewport: DraftViewportRequest): void { this.send({ type: 'REQUEST_DRAFT_VIEWPORT', requestId: requestId(), draftId, viewport }) }
  commitDraft(draftId: string, expectedRevision?: number): void { this.send({ type: 'COMMIT_DRAFT', requestId: requestId(), draftId, expectedRevision }) }
  discardDraft(draftId: string): void { this.send({ type: 'DISCARD_DRAFT', requestId: requestId(), draftId }) }
  load(snapshot: WorkbenchSnapshotEnvelope): void { this.send({ type: 'LOAD_RUN', requestId: requestId(), snapshot }) }
  step(count = 1): void { this.send({ type: 'STEP', requestId: requestId(), count }) }
  play(ticksPerBatch: number): void { this.send({ type: 'PLAY', requestId: requestId(), ticksPerBatch }) }
  pause(): void { this.send({ type: 'PAUSE', requestId: requestId() }) }
  setSpeed(ticksPerBatch: number): void { this.send({ type: 'SET_SPEED', requestId: requestId(), ticksPerBatch }) }
  setViewport(viewport: MapProjectionRequest): void { this.send({ type: 'SET_VIEWPORT', requestId: requestId(), viewport }) }
  reset(): void { this.send({ type: 'RESET', requestId: requestId() }) }

  snapshot(): Promise<WorkbenchSnapshotEnvelope> {
    const id = requestId()
    return new Promise((resolve, reject) => {
      this.pendingSnapshots.set(id, { resolve, reject })
      const timeout = window.setTimeout(() => {
        const pending = this.pendingSnapshots.get(id)
        if (!pending) return
        this.pendingSnapshots.delete(id)
        pending.reject(new Error('Simulation worker snapshot request timed out'))
      }, 15_000)
      const pending = this.pendingSnapshots.get(id)
      if (pending) this.pendingSnapshots.set(id, {
        resolve: (snapshot) => { window.clearTimeout(timeout); resolve(snapshot) },
        reject: (error) => { window.clearTimeout(timeout); reject(error) },
      })
      this.send({ type: 'REQUEST_SNAPSHOT', requestId: id })
    })
  }

  dispose(): void {
    this.rejectPending(new Error('Simulation worker client was disposed'))
    this.send({ type: 'DISPOSE', requestId: requestId() })
    this.worker.terminate()
  }

  private send(command: SimulationCommand): void {
    this.worker.postMessage(command)
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pendingSnapshots.values()) pending.reject(error)
    this.pendingSnapshots.clear()
  }
}
