import { WorkbenchProjectionBuilder, type MapProjectionRequest } from '../projection'
import { SimulationEngine } from '../simulation/engine/engine'
import type { SimulationEvent, StatisticSample } from '../simulation/domain/types'
import type { SimulationResponse, WorkbenchSnapshotEnvelope } from '../worker/protocol'
import { HOSTED_PROTOCOL_VERSION, validateHostedRunRecord, type HostedCommandResult, type HostedRunBootstrap, type HostedRunCommand, type HostedRunRecord, type HostedRunStore, type HostedRunView, type HostedTelemetryStore } from './types'

export interface HostedRunObservation { tick: number; digest: string }

/**
 * Serial authoritative executor for one server-owned run. It deliberately
 * accepts commands, never client state; its output is the same bounded
 * projection/response shape used by the browser worker.
 */
export class HostedRunService {
  private engine: SimulationEngine
  private projectionBuilder: WorkbenchProjectionBuilder
  private viewport: MapProjectionRequest
  private commandQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly bootstrap: HostedRunBootstrap, private readonly store: HostedRunStore, engine: SimulationEngine) {
    this.engine = engine
    const source = engine.project()
    this.projectionBuilder = new WorkbenchProjectionBuilder(source)
    this.viewport = defaultViewport(source.world.grid.width, source.world.grid.height)
  }

  static async open(bootstrap: HostedRunBootstrap, store: HostedRunStore): Promise<HostedRunService> {
    const stored = await store.load(bootstrap.runId)
    if (stored !== undefined) validateStoredRecord(stored, bootstrap)
    const engine = stored === undefined ? SimulationEngine.create(bootstrap.creation) : await SimulationEngine.restore(stored.snapshot)
    const service = new HostedRunService(bootstrap, store, engine)
    if (stored === undefined) await service.persist()
    return service
  }

  async execute(ownerToken: string, command: HostedRunCommand): Promise<HostedCommandResult> {
    this.authorize(ownerToken)
    let result!: HostedCommandResult
    const operation = this.commandQueue.then(async () => { result = await this.apply(command) })
    this.commandQueue = operation.then(() => undefined, () => undefined)
    await operation
    return result
  }

  async view(ownerToken: string): Promise<HostedRunView> {
    this.authorize(ownerToken)
    await this.commandQueue
    return { protocolVersion: HOSTED_PROTOCOL_VERSION, runId: this.bootstrap.runId, observedTick: this.engine.project().tick, projection: this.frame().projection }
  }

  /** Narrow host-only observations used to resume durable background jobs. */
  runId(): string { return this.bootstrap.runId }
  async tick(ownerToken: string): Promise<number> {
    return (await this.observe(ownerToken)).tick
  }

  async observe(ownerToken: string): Promise<HostedRunObservation> {
    this.authorize(ownerToken)
    await this.commandQueue
    const snapshot = await this.snapshot()
    return { tick: snapshot.state.tick, digest: snapshot.digest }
  }

  /** A job quantum commits only when its durable precondition still names this exact run state. */
  async advanceJob(ownerToken: string, expected: HostedRunObservation, count: number): Promise<HostedRunObservation> {
    this.authorize(ownerToken)
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Hosted job step count must be a positive safe integer')
    let observation!: HostedRunObservation
    const operation = this.commandQueue.then(async () => {
      const before = await this.snapshot()
      if (before.state.tick !== expected.tick || before.digest !== expected.digest) throw new Error('Hosted job run state conflict')
      const result = this.engine.advance(count)
      const after = await this.snapshot()
      await this.persist(after, result.events, result.statistics)
      observation = { tick: after.state.tick, digest: after.digest }
    })
    this.commandQueue = operation.then(() => undefined, () => undefined)
    await operation
    return observation
  }

  private async apply(command: HostedRunCommand): Promise<HostedCommandResult> {
    const responses: SimulationResponse[] = []
    switch (command.type) {
      case 'STEP': {
        const count = command.count ?? 1
        if (!Number.isSafeInteger(count) || count < 1) throw new Error('Hosted step count must be a positive safe integer')
        const result = this.engine.advance(count)
        responses.push(this.frame(command.requestId, result.events, result.statistics))
        responses.push({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch: 1 })
        await this.persist(undefined, result.events, result.statistics)
        break
      }
      case 'SET_VIEWPORT':
        this.viewport = normalizeViewport(command.viewport)
        responses.push(this.frame(command.requestId))
        break
      case 'REQUEST_SNAPSHOT': {
        const snapshot = await this.snapshot()
        responses.push({ type: 'SNAPSHOT', requestId: command.requestId, snapshot })
        responses.push(this.frame(command.requestId))
        break
      }
      case 'PAUSE':
        responses.push({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch: 1 })
        break
      case 'SET_SPEED':
        // The initial host is explicit-step only. Keep the protocol response
        // visible without inventing a server wall-clock scheduler.
        responses.push({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch: boundedSpeed(command.ticksPerBatch) })
        break
      case 'RESET': {
        this.engine = SimulationEngine.create(this.bootstrap.creation)
        const source = this.engine.project()
        this.projectionBuilder = new WorkbenchProjectionBuilder(source)
        this.viewport = defaultViewport(source.world.grid.width, source.world.grid.height)
        const snapshot = await this.snapshot()
        responses.push(this.frame(command.requestId, [this.engine.event('RUN_CREATED', { seed: snapshot.state.config.seed, width: snapshot.state.config.worldWidth, height: snapshot.state.config.worldHeight, population: snapshot.state.people.length, worldName: snapshot.state.world.name })], []))
        responses.push({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch: 1 })
        await this.persist(snapshot)
        break
      }
      default:
        assertNever(command)
    }
    return { protocolVersion: HOSTED_PROTOCOL_VERSION, runId: this.bootstrap.runId, observedTick: this.engine.project().tick, responses }
  }

  private frame(requestId?: string, events: SimulationEvent[] = [], statistics: StatisticSample[] = []): Extract<SimulationResponse, { type: 'FRAME' }> {
    const snapshot = this.engine.project()
    return { type: 'FRAME', requestId, projection: this.projectionBuilder.build(snapshot, this.viewport), events, statistics, processingMs: 0 }
  }

  private async snapshot(): Promise<WorkbenchSnapshotEnvelope> {
    return { ...await this.engine.snapshot(), workerContinuation: { version: 1, ticksPerBatch: 1, batch: { remaining: 0, advanced: 0 } } }
  }

  private async persist(snapshot?: WorkbenchSnapshotEnvelope, events: readonly SimulationEvent[] = [], statistics: readonly StatisticSample[] = []): Promise<void> {
    const persistedSnapshot = snapshot ?? await this.snapshot()
    const record: HostedRunRecord = { protocolVersion: HOSTED_PROTOCOL_VERSION, runId: this.bootstrap.runId, ownerId: this.bootstrap.ownerId, savedAt: new Date().toISOString(), snapshot: persistedSnapshot }
    if (isTelemetryStore(this.store)) await this.store.saveWithTelemetry(record, events, statistics)
    else await this.store.save(record)
  }

  private authorize(ownerToken: string): void {
    if (ownerToken !== this.bootstrap.ownerToken) throw new Error('Hosted run authorization failed')
  }
}

function isTelemetryStore(store: HostedRunStore): store is HostedRunStore & HostedTelemetryStore {
  return 'saveWithTelemetry' in store && typeof store.saveWithTelemetry === 'function'
}

function defaultViewport(width: number, height: number): MapProjectionRequest {
  return { revision: 0, bounds: { minQ: 0, maxQ: width - 1, minR: 0, maxR: height - 1 }, projectedHexRadius: 0, overlay: 'terrain' }
}

function normalizeViewport(viewport: MapProjectionRequest): MapProjectionRequest {
  if (!Number.isSafeInteger(viewport.revision) || viewport.revision < 0) throw new Error('Hosted viewport revision is invalid')
  const { bounds } = viewport
  if (!Number.isSafeInteger(bounds.minQ) || !Number.isSafeInteger(bounds.maxQ) || !Number.isSafeInteger(bounds.minR) || !Number.isSafeInteger(bounds.maxR)
    || bounds.minQ > bounds.maxQ || bounds.minR > bounds.maxR) throw new Error('Hosted viewport bounds are invalid')
  if (!Number.isFinite(viewport.projectedHexRadius) || viewport.projectedHexRadius < 0) throw new Error('Hosted viewport radius is invalid')
  return viewport
}

function validateStoredRecord(record: HostedRunRecord, bootstrap: HostedRunBootstrap): void {
  validateHostedRunRecord(record)
  if (record.runId !== bootstrap.runId || record.ownerId !== bootstrap.ownerId) throw new Error('Hosted run record does not match its configured owner')
}

function boundedSpeed(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Hosted speed must be a safe integer')
  return Math.max(1, Math.min(8760, value))
}

function assertNever(value: never): never {
  throw new Error(`Unsupported hosted command: ${JSON.stringify(value)}`)
}
