/// <reference lib="webworker" />

import { SimulationEngine } from '../simulation/engine/engine'
import { SimulationApplicationService } from '../runtime/simulationApplicationService'
import { DEFAULT_PREINDUSTRIAL_PACK, resolveContentPack, type ContentPack, type ResolvedContentPack } from '../contentPacks'
import { NO_PROJECTION_INVALIDATION, WorkbenchProjectionBuilder, mergeProjectionInvalidations, projectionInvalidationFromChangeSet, type MapProjectionRequest, type ProjectionInvalidation } from '../projection'
import type { SimulationEvent, StatisticSample, WorldCreationDraft, WorldDraftRecord } from '../simulation/domain/types'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { createWorldDraftRecord, paintWorldDraftElevation, paintWorldDraftResources, paintWorldDraftTerrain, previewWorldDraft, projectWorldDraftViewport, redoWorldDraftRecord, resetWorldDraftRecord, undoWorldDraftRecord, updateWorldDraftRecord, updateWorldDraftZoneCells, validateWorldDraftRecord } from '../simulation/domain/worldDraft'
import type { SimulationCommand, SimulationResponse, WorkbenchCheckpointEnvelope, WorkbenchSnapshotEnvelope } from './protocol'
import { CheckpointTelemetryBuffer, MAX_TICKS_PER_WORKER_TURN, SimulationBatchScheduler, TelemetryBuffer, validateWorkerContinuation, type WorkerContinuationState } from './frameScheduler'
import { completeRetention, type EventRetentionReport } from '../simulation/events/retention'

const worker = self as DedicatedWorkerGlobalScope
let engine: SimulationEngine | undefined
let projectionBuilder: WorkbenchProjectionBuilder | undefined
let viewportRequest: MapProjectionRequest | undefined
let projectionEpoch = 0
let pendingProjectionInvalidation: ProjectionInvalidation = NO_PROJECTION_INVALIDATION
let initialCreation: WorldCreationDraft = defaultWorldCreationRequest('valley-001')
let activeContentPack: ResolvedContentPack = resolveContentPack(DEFAULT_PREINDUSTRIAL_PACK)
let activeDraft: WorldDraftRecord | undefined
let playing = false
let ticksPerBatch = 24
let loopScheduled = false
let snapshotting = false
let lastFrameAt = 0
let processingSinceFrame = 0
const batchScheduler = new SimulationBatchScheduler()
const telemetry = new TelemetryBuffer()
const checkpointTelemetry = new CheckpointTelemetryBuffer()
const application = new SimulationApplicationService()
const FRAME_INTERVAL_MS = 100
let commandQueue: Promise<void> = Promise.resolve()

function respond(response: SimulationResponse): void {
  worker.postMessage(response)
}

async function create(creation: WorldCreationDraft, requestId?: string, contentPack: ContentPack | ResolvedContentPack = activeContentPack): Promise<void> {
  const resolvedPack = resolveContentPack(contentPack)
  const candidate = SimulationEngine.create(creation, 32, 24, resolvedPack)
  initialCreation = creation
  activeContentPack = resolvedPack
  engine = candidate
  installProjectionBuilder()
  const snapshot = await engine.snapshot()
  clearPendingTelemetry()
  const created = engine.event('RUN_CREATED', { seed: snapshot.state.config.seed, width: snapshot.state.config.worldWidth, height: snapshot.state.config.worldHeight, population: snapshot.state.people.length, worldName: snapshot.state.world.name })
  checkpointTelemetry.append([created], [])
  sendFrame(requestId, snapshot.digest, [created], [], 0)
  respond({ type: 'STATUS', requestId, status: 'paused', ticksPerBatch })
}

async function sendCheckpoint(requestId: string, committed: WorkbenchCheckpointEnvelope['committed']): Promise<void> {
  if (!engine) throw new Error('No simulation run is loaded')
  if (!validWatermark(committed.eventSequence) || !validWatermark(committed.statisticTick)) throw new Error('Committed telemetry watermark is invalid')
  snapshotting = true
  try {
    const snapshot: WorkbenchSnapshotEnvelope = { ...await engine.snapshot(), workerContinuation: workerContinuation() }
    const delta = checkpointTelemetry.since(committed.eventSequence, committed.statisticTick)
    const checkpoint: WorkbenchCheckpointEnvelope = {
      version: 1,
      checkpointId: requestId,
      snapshot,
      committed,
      through: { eventSequence: snapshot.state.nextEventSequence - 1, statisticTick: snapshot.state.tick },
      events: delta.events,
      statistics: delta.statistics,
      eventRetention: delta.eventRetention,
    }
    respond({ type: 'CHECKPOINT', requestId, checkpoint })
  } finally {
    snapshotting = false
    scheduleLoop()
  }
}

async function sendSnapshot(requestId: string): Promise<void> {
  if (!engine) throw new Error('No simulation run is loaded')
  snapshotting = true
  try {
    const snapshot: WorkbenchSnapshotEnvelope = { ...await engine.snapshot(), workerContinuation: workerContinuation() }
    respond({ type: 'SNAPSHOT', requestId, snapshot })
    // Snapshotting is observational, but its companion frame is also a safe
    // opportunity to deliver telemetry already produced by prior tick quanta.
    flushFrame(requestId, snapshot.digest)
  } finally {
    snapshotting = false
    scheduleLoop()
  }
}

function scheduleLoop(): void {
  if (loopScheduled || !playing || snapshotting) return
  loopScheduled = true
  setTimeout(runLoop, 0)
}

function runLoop(): void {
  loopScheduled = false
  if (!playing || !engine || snapshotting) return
  try {
    const quantum = batchScheduler.next(ticksPerBatch, MAX_TICKS_PER_WORKER_TURN)
    const started = performance.now()
    const result = engine.advance(quantum.ticks, { clockEventHours: quantum.clockEventHours })
    pendingProjectionInvalidation = mergeProjectionInvalidations(pendingProjectionInvalidation, projectionInvalidationFromChangeSet(result.changeSet))
    processingSinceFrame += performance.now() - started
    telemetry.append(result.events, result.statistics, result.eventRetention)
    checkpointTelemetry.append(result.events, result.statistics, result.eventRetention)
    const now = performance.now()
    if (now - lastFrameAt >= FRAME_INTERVAL_MS || telemetry.shouldFlush()) {
      lastFrameAt = now
      flushFrame()
    }
  } catch (error) {
    playing = false
    reportError(error)
  }
  scheduleLoop()
}

function installProjectionBuilder(): void {
  if (!engine) return
  const source = engine.project()
  projectionBuilder = new WorkbenchProjectionBuilder(source)
  projectionEpoch += 1
  pendingProjectionInvalidation = NO_PROJECTION_INVALIDATION
  viewportRequest = defaultViewportRequest(source.world.grid.width, source.world.grid.height)
  batchScheduler.reset()
  processingSinceFrame = 0
  lastFrameAt = performance.now()
}

function workerContinuation(): WorkerContinuationState {
  return { version: 1, ticksPerBatch, batch: batchScheduler.state() }
}

function restoreWorkerContinuation(value: unknown): void {
  const checkpoint = validateWorkerContinuation(value)
  if (!checkpoint) return
  ticksPerBatch = checkpoint.ticksPerBatch
  batchScheduler.restore(checkpoint.batch)
}

function defaultViewportRequest(width: number, height: number): MapProjectionRequest {
  return { revision: 0, bounds: { minQ: 0, maxQ: width - 1, minR: 0, maxR: height - 1 }, projectedHexRadius: 0, overlay: 'terrain' }
}

function sendFrame(requestId?: string, digest?: string, events?: SimulationEvent[], statistics?: StatisticSample[], processingMs = processingSinceFrame, eventRetention?: EventRetentionReport): void {
  if (!engine || !projectionBuilder || !viewportRequest) throw new Error('No simulation projection is available')
  const drainsTelemetry = events === undefined || statistics === undefined
  const drained = drainsTelemetry ? telemetry.drain() : { events, statistics, eventRetention: eventRetention ?? completeRetention(events) }
  const invalidation = pendingProjectionInvalidation
  pendingProjectionInvalidation = NO_PROJECTION_INVALIDATION
  const projection = projectionBuilder.build(engine.project(), viewportRequest, digest, projectionEpoch, invalidation)
  respond({ type: 'FRAME', requestId, projection, events: drained.events, statistics: drained.statistics, eventRetention: drained.eventRetention, processingMs, projectionInvalidation: invalidation })
  if (drainsTelemetry) processingSinceFrame = 0
}

function flushFrame(requestId?: string, digest?: string): void {
  sendFrame(requestId, digest)
}

function clearPendingTelemetry(): void {
  telemetry.clear()
  checkpointTelemetry.clear()
  processingSinceFrame = 0
}

function finalizePartialBatch(): void {
  const hours = batchScheduler.finalizePartial()
  if (engine && hours) { const event = engine.completeAdvanceBatch(hours); telemetry.append([event], []); checkpointTelemetry.append([event], []) }
}

function reportError(error: unknown, requestId?: string): void {
  const normalized = error instanceof Error ? error : new Error(String(error))
  respond({ type: 'ERROR', requestId, message: normalized.message, stack: normalized.stack })
}

worker.addEventListener('message', (message: MessageEvent<SimulationCommand>) => {
  const command = message.data
  commandQueue = commandQueue.then(async () => {
    try {
      switch (command.type) {
        case 'CREATE_RUN':
          playing = false
          await create(command.creation, command.requestId, command.contentPack)
          break
        case 'CREATE_DRAFT': {
          if (activeDraft) throw new Error(`A world draft is already active: ${activeDraft.draftId}`)
          const candidate = createWorldDraftRecord(command.draftId, command.draft)
          const preview = previewWorldDraft(candidate)
          activeDraft = candidate
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'created', draft: candidate, preview })
          break
        }
        case 'HYDRATE_DRAFT': {
          // Persistence is not authoritative simulation state. Validate it at
          // the worker boundary before replacing the active authoring draft.
          const candidate = validateWorldDraftRecord(command.draft)
          const preview = previewWorldDraft(candidate)
          activeDraft = candidate
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'hydrated', draft: candidate, preview })
          break
        }
        case 'UPDATE_DRAFT': {
          const draft = requiredDraft(command.draftId)
          const candidate = updateWorldDraftRecord(draft, command.draft, command.expectedRevision)
          const preview = previewWorldDraft(candidate)
          activeDraft = candidate
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'updated', draft: candidate, preview })
          break
        }
        case 'UPDATE_DRAFT_ZONE_CELLS': {
          const draft = requiredDraft(command.draftId)
          const candidate = updateWorldDraftZoneCells(draft, command.zoneId, command.cellIds, command.expectedRevision)
          const preview = previewWorldDraft(candidate)
          activeDraft = candidate
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'zoneCellsUpdated', draft: candidate, preview })
          break
        }
        case 'PAINT_DRAFT_TERRAIN': {
          const draft = requiredDraft(command.draftId)
          const candidate = paintWorldDraftTerrain(draft, command.cellIds, command.terrain, command.expectedRevision)
          const preview = previewWorldDraft(candidate)
          activeDraft = candidate
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'terrainPainted', draft: candidate, preview })
          break
        }
        case 'PAINT_DRAFT_ELEVATION': {
          const draft = requiredDraft(command.draftId)
          const candidate = paintWorldDraftElevation(draft, command.cellIds, command.elevation, command.expectedRevision)
          const preview = previewWorldDraft(candidate)
          activeDraft = candidate
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'elevationPainted', draft: candidate, preview })
          break
        }
        case 'PAINT_DRAFT_RESOURCES': {
          const draft = requiredDraft(command.draftId)
          const candidate = paintWorldDraftResources(draft, command.cellIds, command.resourceCapacity, command.expectedRevision)
          activeDraft = candidate
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'resourcesPainted', draft: candidate, preview: previewWorldDraft(candidate) })
          break
        }
        case 'UNDO_DRAFT': {
          const candidate = undoWorldDraftRecord(requiredDraft(command.draftId), command.expectedRevision)
          activeDraft = candidate
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'undone', draft: candidate, preview: previewWorldDraft(candidate) })
          break
        }
        case 'REDO_DRAFT': {
          const candidate = redoWorldDraftRecord(requiredDraft(command.draftId), command.expectedRevision)
          activeDraft = candidate
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'redone', draft: candidate, preview: previewWorldDraft(candidate) })
          break
        }
        case 'RESET_DRAFT': {
          const draft = requiredDraft(command.draftId)
          const candidate = resetWorldDraftRecord(draft, command.expectedRevision)
          const preview = previewWorldDraft(candidate)
          activeDraft = candidate
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'reset', draft: candidate, preview })
          break
        }
        case 'REQUEST_DRAFT_PREVIEW': {
          const draft = requiredDraft(command.draftId)
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'previewed', draft, preview: previewWorldDraft(draft) })
          break
        }
        case 'REQUEST_DRAFT_VIEWPORT': {
          const draft = requiredDraft(command.draftId)
          // This is authoring-only terrain data, intentionally not a live FRAME.
          respond({ type: 'DRAFT_VIEWPORT', requestId: command.requestId, viewport: projectWorldDraftViewport(draft, command.viewport) })
          break
        }
        case 'COMMIT_DRAFT': {
          const draft = requiredDraft(command.draftId)
          if (command.expectedRevision !== undefined && command.expectedRevision !== draft.revision) {
            throw new Error(`World draft revision conflict: expected ${command.expectedRevision}, current ${draft.revision}`)
          }
          // Let UI clear stale run artifacts before RUN_CREATED, but reserve
          // final committed state until authoritative creation succeeds.
          playing = false
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'committing', draft })
          await create(draft.draft, command.requestId, command.contentPack)
          activeDraft = undefined
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'committed', draft })
          break
        }
        case 'DISCARD_DRAFT': {
          const draft = requiredDraft(command.draftId)
          activeDraft = undefined
          respond({ type: 'DRAFT', requestId: command.requestId, action: 'discarded', draft })
          break
        }
        case 'LOAD_RUN': {
          playing = false
          const resolvedPack = resolveContentPack(command.contentPack ?? DEFAULT_PREINDUSTRIAL_PACK)
          const candidate = await SimulationEngine.restore(command.snapshot, resolvedPack)
          activeContentPack = resolvedPack
          engine = candidate
          initialCreation = command.snapshot.state.config.worldCreation
          installProjectionBuilder()
          restoreWorkerContinuation(command.snapshot.workerContinuation)
          clearPendingTelemetry()
          const loaded = engine.event('RUN_LOADED', {})
          checkpointTelemetry.append([loaded], [])
          sendFrame(command.requestId, command.snapshot.digest, [loaded], [], 0)
          respond({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch })
          break
        }
        case 'STEP': {
          if (!engine) throw new Error('No simulation run is loaded')
          playing = false
          finalizePartialBatch()
          batchScheduler.reset()
          const started = performance.now()
          const result = application.execute(command, { engine })
          pendingProjectionInvalidation = mergeProjectionInvalidations(pendingProjectionInvalidation, result.projectionInvalidation)
          const snapshot = await engine.snapshot()
          telemetry.append(result.events, result.statistics, result.eventRetention)
          checkpointTelemetry.append(result.events, result.statistics, result.eventRetention)
          processingSinceFrame += performance.now() - started
          flushFrame(command.requestId, snapshot.digest)
          respond({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch })
          break
        }
        case 'MATERIALIZE_COHORT': {
          if (!engine) throw new Error('No simulation run is loaded')
          playing = false
          const result = application.execute(command, { engine })
          pendingProjectionInvalidation = mergeProjectionInvalidations(pendingProjectionInvalidation, result.projectionInvalidation)
          const snapshot = await engine.snapshot()
          telemetry.append(result.events, result.statistics, result.eventRetention)
          checkpointTelemetry.append(result.events, result.statistics, result.eventRetention)
          flushFrame(command.requestId, snapshot.digest)
          respond({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch })
          break
        }
        case 'DEMATERIALIZE_PEOPLE': {
          if (!engine) throw new Error('No simulation run is loaded')
          playing = false
          const result = application.execute(command, { engine })
          pendingProjectionInvalidation = mergeProjectionInvalidations(pendingProjectionInvalidation, result.projectionInvalidation)
          const snapshot = await engine.snapshot()
          telemetry.append(result.events, result.statistics, result.eventRetention)
          checkpointTelemetry.append(result.events, result.statistics, result.eventRetention)
          flushFrame(command.requestId, snapshot.digest)
          respond({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch })
          break
        }
        case 'SET_PROTECTED_PEOPLE': {
          if (!engine) throw new Error('No simulation run is loaded')
          application.execute(command, { engine })
          const snapshot = await engine.snapshot()
          flushFrame(command.requestId, snapshot.digest)
          break
        }
        case 'PLAY':
          if (!engine) throw new Error('No simulation run is loaded')
          ticksPerBatch = Math.max(1, Math.min(8760, Math.floor(command.ticksPerBatch)))
          if (!playing && batchScheduler.state().remaining === 0) batchScheduler.reset()
          playing = true
          respond({ type: 'STATUS', requestId: command.requestId, status: 'playing', ticksPerBatch })
          scheduleLoop()
          break
        case 'PAUSE':
          playing = false
          finalizePartialBatch()
          batchScheduler.reset()
          if (engine) {
            const snapshot = await engine.snapshot()
            const event = engine.event('RUN_PAUSED', {})
            telemetry.append([event], [])
            checkpointTelemetry.append([event], [])
            flushFrame(command.requestId, snapshot.digest)
          }
          respond({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch })
          break
        case 'SET_SPEED':
          ticksPerBatch = Math.max(1, Math.min(8760, Math.floor(command.ticksPerBatch)))
          if (!playing && batchScheduler.state().remaining === 0) batchScheduler.reset()
          respond({ type: 'STATUS', requestId: command.requestId, status: playing ? 'playing' : 'paused', ticksPerBatch })
          break
        case 'SET_VIEWPORT':
          if (!engine || !projectionBuilder) throw new Error('No simulation run is loaded')
          if (viewportRequest && command.viewport.revision < viewportRequest.revision) break
          viewportRequest = command.viewport
          if (!playing) flushFrame(command.requestId)
          break
        case 'REQUEST_SNAPSHOT':
          await sendSnapshot(command.requestId)
          break
        case 'REQUEST_CHECKPOINT':
          await sendCheckpoint(command.requestId, command.committed)
          break
        case 'RESET':
          playing = false
          await create(initialCreation, command.requestId, activeContentPack)
          break
        case 'DISPOSE':
          playing = false
          engine = undefined
          activeDraft = undefined
          projectionBuilder = undefined
          viewportRequest = undefined
          clearPendingTelemetry()
          respond({ type: 'STATUS', requestId: command.requestId, status: 'idle', ticksPerBatch })
          worker.close()
          break
      }
      // ACK is the common correlated completion boundary. Rich FRAME, DRAFT,
      // and SNAPSHOT responses remain available for projections and payloads.
      respond({ type: 'ACK', requestId: command.requestId, command: command.type })
    } catch (error) {
      reportError(error, command.requestId)
    }
  })
})

function validWatermark(value: number): boolean { return Number.isSafeInteger(value) && value >= -1 }

respond({ type: 'READY' })

function requiredDraft(draftId: string): WorldDraftRecord {
  if (!activeDraft || activeDraft.draftId !== draftId) throw new Error(`World draft is not active: ${draftId}`)
  return activeDraft
}
