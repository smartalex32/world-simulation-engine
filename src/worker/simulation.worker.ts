/// <reference lib="webworker" />

import { SimulationEngine } from '../simulation/engine/engine'
import { WorkbenchProjectionBuilder, type MapProjectionRequest } from '../projection'
import type { SimulationEvent, StatisticSample } from '../simulation/domain/types'
import type { SimulationCommand, SimulationResponse, WorkbenchSnapshotEnvelope } from './protocol'
import { MAX_TICKS_PER_WORKER_TURN, SimulationBatchScheduler, TelemetryBuffer, validateWorkerContinuation, type WorkerContinuationState } from './frameScheduler'

const worker = self as DedicatedWorkerGlobalScope
let engine: SimulationEngine | undefined
let projectionBuilder: WorkbenchProjectionBuilder | undefined
let viewportRequest: MapProjectionRequest | undefined
let projectionEpoch = 0
let initialSeed = 'valley-001'
let playing = false
let ticksPerBatch = 24
let loopScheduled = false
let snapshotting = false
let lastFrameAt = 0
let processingSinceFrame = 0
const batchScheduler = new SimulationBatchScheduler()
const telemetry = new TelemetryBuffer()
const FRAME_INTERVAL_MS = 100
let commandQueue: Promise<void> = Promise.resolve()

function respond(response: SimulationResponse): void {
  worker.postMessage(response)
}

async function create(seed: string, requestId?: string): Promise<void> {
  initialSeed = seed.trim() || 'valley-001'
  engine = SimulationEngine.create(initialSeed)
  installProjectionBuilder()
  const snapshot = await engine.snapshot()
  clearPendingTelemetry()
  sendFrame(requestId, snapshot.digest, [engine.event('RUN_CREATED', { seed: initialSeed })], [], 0)
  respond({ type: 'STATUS', requestId, status: 'paused', ticksPerBatch })
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
    processingSinceFrame += performance.now() - started
    telemetry.append(result.events, result.statistics)
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

function sendFrame(requestId?: string, digest?: string, events?: SimulationEvent[], statistics?: StatisticSample[], processingMs = processingSinceFrame): void {
  if (!engine || !projectionBuilder || !viewportRequest) throw new Error('No simulation projection is available')
  const drainsTelemetry = events === undefined || statistics === undefined
  const drained = drainsTelemetry ? telemetry.drain() : { events, statistics }
  const projection = projectionBuilder.build(engine.project(), viewportRequest, digest, projectionEpoch)
  respond({ type: 'FRAME', requestId, projection, events: drained.events, statistics: drained.statistics, processingMs })
  if (drainsTelemetry) processingSinceFrame = 0
}

function flushFrame(requestId?: string, digest?: string): void {
  sendFrame(requestId, digest)
}

function clearPendingTelemetry(): void {
  telemetry.clear()
  processingSinceFrame = 0
}

function finalizePartialBatch(): void {
  const hours = batchScheduler.finalizePartial()
  if (engine && hours) telemetry.append([engine.completeAdvanceBatch(hours)], [])
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
          await create(command.seed, command.requestId)
          break
        case 'LOAD_RUN': {
          playing = false
          engine = await SimulationEngine.restore(command.snapshot)
          initialSeed = command.snapshot.state.config.seed
          installProjectionBuilder()
          restoreWorkerContinuation(command.snapshot.workerContinuation)
          clearPendingTelemetry()
          sendFrame(command.requestId, command.snapshot.digest, [engine.event('RUN_LOADED')], [], 0)
          respond({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch })
          break
        }
        case 'STEP': {
          if (!engine) throw new Error('No simulation run is loaded')
          playing = false
          finalizePartialBatch()
          batchScheduler.reset()
          const started = performance.now()
          const result = engine.advance(command.count ?? 1)
          const snapshot = await engine.snapshot()
          telemetry.append(result.events, result.statistics)
          processingSinceFrame += performance.now() - started
          flushFrame(command.requestId, snapshot.digest)
          respond({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch })
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
            telemetry.append([engine.event('RUN_PAUSED')], [])
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
        case 'RESET':
          playing = false
          await create(initialSeed, command.requestId)
          break
        case 'DISPOSE':
          playing = false
          engine = undefined
          projectionBuilder = undefined
          viewportRequest = undefined
          clearPendingTelemetry()
          respond({ type: 'STATUS', requestId: command.requestId, status: 'idle', ticksPerBatch })
          worker.close()
          break
      }
    } catch (error) {
      reportError(error, command.requestId)
    }
  })
})

respond({ type: 'READY' })
