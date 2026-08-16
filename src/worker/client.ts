import type { MapProjectionRequest } from '../projection'
import type { WorldCreationDraft, WorldDraftRecord } from '../simulation/domain/types'
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
  resetDraft(draftId: string, expectedRevision?: number): void { this.send({ type: 'RESET_DRAFT', requestId: requestId(), draftId, expectedRevision }) }
  previewDraft(draftId: string): void { this.send({ type: 'REQUEST_DRAFT_PREVIEW', requestId: requestId(), draftId }) }
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
      this.send({ type: 'REQUEST_SNAPSHOT', requestId: id })
    })
  }

  dispose(): void {
    this.send({ type: 'DISPOSE', requestId: requestId() })
  }

  private send(command: SimulationCommand): void {
    this.worker.postMessage(command)
  }
}
