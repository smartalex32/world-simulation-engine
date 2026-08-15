/// <reference lib="webworker" />

import { SimulationEngine } from '../simulation/engine/engine'
import type { SimulationCommand, SimulationResponse } from './protocol'

const worker = self as DedicatedWorkerGlobalScope
let engine: SimulationEngine | undefined
let initialSeed = 'valley-001'
let playing = false
let ticksPerBatch = 24
let loopScheduled = false
let lastFrameAt = 0

function respond(response: SimulationResponse): void {
  worker.postMessage(response)
}

async function create(seed: string, requestId?: string): Promise<void> {
  initialSeed = seed.trim() || 'valley-001'
  engine = SimulationEngine.create(initialSeed)
  const snapshot = await engine.snapshot()
  respond({
    type: 'FRAME',
    requestId,
    projection: engine.project(snapshot.digest),
    events: [engine.event('RUN_CREATED', { seed: initialSeed })],
    statistics: [],
    processingMs: 0,
  })
  respond({ type: 'STATUS', requestId, status: 'paused', ticksPerBatch })
}

async function sendSnapshot(requestId: string): Promise<void> {
  if (!engine) throw new Error('No simulation run is loaded')
  const snapshot = await engine.snapshot()
  respond({ type: 'SNAPSHOT', requestId, snapshot })
  respond({ type: 'FRAME', requestId, projection: engine.project(snapshot.digest), events: [], statistics: [], processingMs: 0 })
}

function scheduleLoop(): void {
  if (loopScheduled || !playing) return
  loopScheduled = true
  setTimeout(runLoop, 0)
}

function runLoop(): void {
  loopScheduled = false
  if (!playing || !engine) return
  try {
    const started = performance.now()
    const result = engine.step(ticksPerBatch)
    const processingMs = performance.now() - started
    const now = performance.now()
    if (now - lastFrameAt >= 100) {
      lastFrameAt = now
      respond({ type: 'FRAME', projection: result.projection, events: result.events, statistics: result.statistics, processingMs })
    }
  } catch (error) {
    playing = false
    reportError(error)
  }
  scheduleLoop()
}

function reportError(error: unknown, requestId?: string): void {
  const normalized = error instanceof Error ? error : new Error(String(error))
  respond({ type: 'ERROR', requestId, message: normalized.message, stack: normalized.stack })
}

worker.addEventListener('message', (message: MessageEvent<SimulationCommand>) => {
  const command = message.data
  void (async () => {
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
          respond({ type: 'FRAME', requestId: command.requestId, projection: engine.project(command.snapshot.digest), events: [engine.event('RUN_LOADED')], statistics: [], processingMs: 0 })
          respond({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch })
          break
        }
        case 'STEP': {
          if (!engine) throw new Error('No simulation run is loaded')
          playing = false
          const started = performance.now()
          const result = engine.step(command.count ?? 1)
          const snapshot = await engine.snapshot()
          respond({ ...result, type: 'FRAME', requestId: command.requestId, projection: engine.project(snapshot.digest), processingMs: performance.now() - started })
          respond({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch })
          break
        }
        case 'PLAY':
          if (!engine) throw new Error('No simulation run is loaded')
          ticksPerBatch = Math.max(1, Math.min(8760, Math.floor(command.ticksPerBatch)))
          playing = true
          respond({ type: 'STATUS', requestId: command.requestId, status: 'playing', ticksPerBatch })
          scheduleLoop()
          break
        case 'PAUSE':
          playing = false
          if (engine) {
            const snapshot = await engine.snapshot()
            respond({ type: 'FRAME', requestId: command.requestId, projection: engine.project(snapshot.digest), events: [engine.event('RUN_PAUSED')], statistics: [], processingMs: 0 })
          }
          respond({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch })
          break
        case 'SET_SPEED':
          ticksPerBatch = Math.max(1, Math.min(8760, Math.floor(command.ticksPerBatch)))
          respond({ type: 'STATUS', requestId: command.requestId, status: playing ? 'playing' : 'paused', ticksPerBatch })
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
          respond({ type: 'STATUS', requestId: command.requestId, status: 'idle', ticksPerBatch })
          worker.close()
          break
      }
    } catch (error) {
      reportError(error, command.requestId)
    }
  })()
})

respond({ type: 'READY' })
