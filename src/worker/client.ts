import type { MapProjectionRequest } from '../projection'
import type { DraftViewportRequest, Terrain, WorldCreationDraft, WorldDraftRecord } from '../simulation/domain/types'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { requestId, type CommandAcknowledgement, type SimulationCommand, type SimulationResponse, type WorkbenchSnapshotEnvelope } from './protocol'
import type { ContentPack, ResolvedContentPack } from '../contentPacks'

type Listener = (response: SimulationResponse) => void
type CommandAck = CommandAcknowledgement

export class SimulationWorkerClient {
  private readonly worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' })
  private readonly listeners = new Set<Listener>()
  private readonly pendingSnapshots = new Map<string, { resolve: (snapshot: WorkbenchSnapshotEnvelope) => void; reject: (error: Error) => void }>()
  private readonly pendingCommands = new Map<string, { resolve: (ack: CommandAck) => void; reject: (error: Error) => void }>()
  private ready = false

  constructor() {
    if ((globalThis as { __playwrightExposeSimulationWorker?: boolean }).__playwrightExposeSimulationWorker) {
      (globalThis as { __playwrightSimulationWorker?: SimulationWorkerClient }).__playwrightSimulationWorker = this
    }
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
      if (response.type === 'ACK') {
        const pending = this.pendingCommands.get(response.requestId)
        if (pending) { this.pendingCommands.delete(response.requestId); pending.resolve(response) }
      }
      if (response.type === 'ERROR' && response.requestId) {
        const pending = this.pendingSnapshots.get(response.requestId)
        if (pending) {
          this.pendingSnapshots.delete(response.requestId)
          pending.reject(new Error(response.message))
        }
        const command = this.pendingCommands.get(response.requestId)
        if (command) { this.pendingCommands.delete(response.requestId); command.reject(new Error(response.message)) }
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

  create(creation: WorldCreationDraft | string, contentPack?: ContentPack | ResolvedContentPack) { return this.command({ type: 'CREATE_RUN', requestId: requestId(), creation: typeof creation === 'string' ? defaultWorldCreationRequest(creation) : creation, contentPack }) }
  createDraft(draftId: string, draft: WorldCreationDraft) { return this.command({ type: 'CREATE_DRAFT', requestId: requestId(), draftId, draft }) }
  hydrateDraft(draft: WorldDraftRecord) { return this.command({ type: 'HYDRATE_DRAFT', requestId: requestId(), draft }) }
  updateDraft(draftId: string, draft: WorldCreationDraft, expectedRevision?: number) { return this.command({ type: 'UPDATE_DRAFT', requestId: requestId(), draftId, draft, expectedRevision }) }
  updateDraftZoneCells(draftId: string, zoneId: string, cellIds: string[], expectedRevision?: number) { return this.command({ type: 'UPDATE_DRAFT_ZONE_CELLS', requestId: requestId(), draftId, zoneId, cellIds, expectedRevision }) }
  paintDraftTerrain(draftId: string, cellIds: string[], terrain: Terrain, expectedRevision?: number) { return this.command({ type: 'PAINT_DRAFT_TERRAIN', requestId: requestId(), draftId, cellIds, terrain, expectedRevision }) }
  paintDraftElevation(draftId: string, cellIds: string[], elevation: number, expectedRevision?: number) { return this.command({ type: 'PAINT_DRAFT_ELEVATION', requestId: requestId(), draftId, cellIds, elevation, expectedRevision }) }
  paintDraftResources(draftId: string, cellIds: string[], resourceCapacity: number, expectedRevision?: number) { return this.command({ type: 'PAINT_DRAFT_RESOURCES', requestId: requestId(), draftId, cellIds, resourceCapacity, expectedRevision }) }
  undoDraft(draftId: string, expectedRevision?: number) { return this.command({ type: 'UNDO_DRAFT', requestId: requestId(), draftId, expectedRevision }) }
  redoDraft(draftId: string, expectedRevision?: number) { return this.command({ type: 'REDO_DRAFT', requestId: requestId(), draftId, expectedRevision }) }
  resetDraft(draftId: string, expectedRevision?: number) { return this.command({ type: 'RESET_DRAFT', requestId: requestId(), draftId, expectedRevision }) }
  previewDraft(draftId: string) { return this.command({ type: 'REQUEST_DRAFT_PREVIEW', requestId: requestId(), draftId }) }
  requestDraftViewport(draftId: string, viewport: DraftViewportRequest) { return this.command({ type: 'REQUEST_DRAFT_VIEWPORT', requestId: requestId(), draftId, viewport }) }
  commitDraft(draftId: string, expectedRevision?: number, contentPack?: ContentPack | ResolvedContentPack) { return this.command({ type: 'COMMIT_DRAFT', requestId: requestId(), draftId, expectedRevision, contentPack }) }
  discardDraft(draftId: string) { return this.command({ type: 'DISCARD_DRAFT', requestId: requestId(), draftId }) }
  load(snapshot: WorkbenchSnapshotEnvelope, contentPack?: ContentPack | ResolvedContentPack) { return this.command({ type: 'LOAD_RUN', requestId: requestId(), snapshot, contentPack }) }
  step(count = 1) { return this.command({ type: 'STEP', requestId: requestId(), count }) }
  materializeCohort(cohortId: string, populationCount: number) { return this.command({ type: 'MATERIALIZE_COHORT', requestId: requestId(), cohortId, populationCount }) }
  dematerializePeople(personIds: string[]) { return this.command({ type: 'DEMATERIALIZE_PEOPLE', requestId: requestId(), personIds }) }
  setProtectedPeople(personIds: string[]) { return this.command({ type: 'SET_PROTECTED_PEOPLE', requestId: requestId(), personIds }) }
  play(ticksPerBatch: number) { return this.command({ type: 'PLAY', requestId: requestId(), ticksPerBatch }) }
  pause() { return this.command({ type: 'PAUSE', requestId: requestId() }) }
  setSpeed(ticksPerBatch: number) { return this.command({ type: 'SET_SPEED', requestId: requestId(), ticksPerBatch }) }
  setViewport(viewport: MapProjectionRequest) { return this.command({ type: 'SET_VIEWPORT', requestId: requestId(), viewport }) }
  reset() { return this.command({ type: 'RESET', requestId: requestId() }) }

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

  /** Sends any runtime command with an explicit correlated completion. Legacy
   * convenience methods retain their fire-and-forget behavior for UI flows
   * that already consume richer FRAME/DRAFT responses. */
  execute<C extends SimulationCommand>(command: C): Promise<CommandAcknowledgement<C>> {
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        const pending = this.pendingCommands.get(command.requestId)
        if (!pending) return
        this.pendingCommands.delete(command.requestId)
        pending.reject(new Error(`Simulation worker ${command.type} request timed out`))
      }, 15_000)
      this.pendingCommands.set(command.requestId, {
        resolve: (ack) => { globalThis.clearTimeout(timeout); resolve(ack as CommandAcknowledgement<C>) },
        reject: (error) => { globalThis.clearTimeout(timeout); reject(error) },
      })
      this.send(command)
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

  private command<C extends SimulationCommand>(command: C): Promise<CommandAcknowledgement<C>> {
    const result = this.execute(command)
    void result.catch(() => undefined)
    return result
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pendingSnapshots.values()) pending.reject(error)
    this.pendingSnapshots.clear()
    for (const pending of this.pendingCommands.values()) pending.reject(error)
    this.pendingCommands.clear()
  }
}
