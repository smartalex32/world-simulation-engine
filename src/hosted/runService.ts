import { WorkbenchProjectionBuilder, type MapProjectionRequest } from '../projection'
import { SimulationEngine } from '../simulation/engine/engine'
import type { SimulationEvent, StatisticSample } from '../simulation/domain/types'
import type { SimulationResponse, WorkbenchSnapshotEnvelope } from '../worker/protocol'
import { HOSTED_PROTOCOL_VERSION, validateHostedRunRecord, type HostedCommandResult, type HostedRunBootstrap, type HostedRunCommand, type HostedRunMutationStore, type HostedRunRecord, type HostedRunStore, type HostedRunView, type HostedSimulationJob, type HostedTelemetryStore } from './types'

export interface HostedRunObservation { tick: number; digest: string }

/** Commands are evaluated against a restored candidate. The live engine changes
 * only after a durable compare-and-swap mutation has committed. */
export class HostedRunService {
  private projectionBuilder: WorkbenchProjectionBuilder
  private viewport: MapProjectionRequest
  private commandQueue: Promise<void> = Promise.resolve()
  private constructor(private readonly bootstrap: HostedRunBootstrap, private readonly store: HostedRunStore, private engine: SimulationEngine) { const source = engine.project(); this.projectionBuilder = new WorkbenchProjectionBuilder(source); this.viewport = defaultViewport(source.world.grid.width, source.world.grid.height) }
  static async open(bootstrap: HostedRunBootstrap, store: HostedRunStore): Promise<HostedRunService> { const stored = await store.load(bootstrap.runId); if (stored) validateStoredRecord(stored, bootstrap); const service = new HostedRunService(bootstrap, store, stored ? await SimulationEngine.restore(stored.snapshot) : SimulationEngine.create(bootstrap.creation)); if (!stored) await service.persistInitial(); return service }
  async execute(ownerToken: string, command: HostedRunCommand): Promise<HostedCommandResult> { this.authorize(ownerToken); return this.serial(() => this.apply(command)) }
  async view(ownerToken: string): Promise<HostedRunView> { this.authorize(ownerToken); await this.commandQueue; return { protocolVersion: HOSTED_PROTOCOL_VERSION, runId: this.bootstrap.runId, observedTick: this.engine.project().tick, projection: this.frame().projection } }
  runId(): string { return this.bootstrap.runId }
  async tick(ownerToken: string): Promise<number> { return (await this.observe(ownerToken)).tick }
  async observe(ownerToken: string): Promise<HostedRunObservation> { this.authorize(ownerToken); await this.commandQueue; const snapshot = await this.snapshot(this.engine); return { tick: snapshot.state.tick, digest: snapshot.digest } }
  /** The supplied job transition is committed with its snapshot and telemetry. */
  async advanceJob(ownerToken: string, expected: HostedRunObservation, count: number, jobFor?: (after: HostedRunObservation) => HostedSimulationJob): Promise<HostedRunObservation> { this.authorize(ownerToken); if (!Number.isSafeInteger(count) || count < 1) throw new Error('Hosted job step count must be a positive safe integer'); return this.serial(async () => { const before = await this.snapshot(this.engine); if (before.state.tick !== expected.tick || before.digest !== expected.digest) throw new Error('Hosted job run state conflict'); const candidate = await SimulationEngine.restore(before); const result = candidate.advance(count); const after = await this.snapshot(candidate); const observation = { tick: after.state.tick, digest: after.digest }; const job = jobFor?.(observation); const outcome = await this.commit(before, after, `job:${job ? `${job.jobId}:${expected.digest}` : `${expected.digest}:${count}`}`, result.events, result.statistics, job); this.replaceEngine(outcome === 'already-committed' ? await this.restoreDurable() : candidate); return outcome === 'already-committed' ? await this.observeUnqueued() : observation }) }
  private async apply(command: HostedRunCommand): Promise<HostedCommandResult> {
    if (command.type === 'SET_VIEWPORT') { this.viewport = normalizeViewport(command.viewport); return this.result([this.frame(command.requestId)]) }
    if (command.type === 'REQUEST_SNAPSHOT') { const snapshot = await this.snapshot(this.engine); return this.result([{ type: 'SNAPSHOT', requestId: command.requestId, snapshot }, this.frame(command.requestId)]) }
    if (command.type === 'PAUSE') return this.result([{ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch: 1 }])
    if (command.type === 'SET_SPEED') return this.result([{ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch: boundedSpeed(command.ticksPerBatch) }])
    const before = await this.snapshot(this.engine); const candidate = command.type === 'RESET' ? SimulationEngine.create(this.bootstrap.creation) : await SimulationEngine.restore(before); const events: SimulationEvent[] = []; const statistics: StatisticSample[] = []
    if (command.type === 'STEP') { const count = command.count ?? 1; if (!Number.isSafeInteger(count) || count < 1) throw new Error('Hosted step count must be a positive safe integer'); const result = candidate.advance(count); events.push(...result.events); statistics.push(...result.statistics) }
    else if (command.type === 'MATERIALIZE_COHORT') events.push(candidate.materializeCohort(command.cohortId, command.populationCount))
    else if (command.type === 'DEMATERIALIZE_PEOPLE') events.push(candidate.dematerializePeople(command.personIds))
    else if (command.type === 'SET_PROTECTED_PEOPLE') candidate.protectDetailedPeople(command.personIds)
    else if (command.type === 'RESET') { const snapshot = await this.snapshot(candidate); events.push(candidate.event('RUN_CREATED', { seed: snapshot.state.config.seed, width: snapshot.state.config.worldWidth, height: snapshot.state.config.worldHeight, population: snapshot.state.people.length, worldName: snapshot.state.world.name })) }
    else assertNever(command)
    const after = await this.snapshot(candidate); const outcome = await this.commit(before, after, `command:${command.requestId}`, events, statistics); this.replaceEngine(outcome === 'already-committed' ? await this.restoreDurable() : candidate)
    const responses: SimulationResponse[] = [this.frame(command.requestId, events, statistics)]; if (command.type === 'STEP' || command.type === 'RESET') responses.push({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch: 1 }); return this.result(responses)
  }
  private result(responses: SimulationResponse[]): HostedCommandResult { return { protocolVersion: HOSTED_PROTOCOL_VERSION, runId: this.bootstrap.runId, observedTick: this.engine.project().tick, responses } }
  private replaceEngine(engine: SimulationEngine): void { this.engine = engine; const source = engine.project(); this.projectionBuilder = new WorkbenchProjectionBuilder(source); this.viewport = defaultViewport(source.world.grid.width, source.world.grid.height) }
  private frame(requestId?: string, events: SimulationEvent[] = [], statistics: StatisticSample[] = []): Extract<SimulationResponse, { type: 'FRAME' }> { return { type: 'FRAME', requestId, projection: this.projectionBuilder.build(this.engine.project(), this.viewport), events, statistics, processingMs: 0 } }
  private async snapshot(engine: SimulationEngine): Promise<WorkbenchSnapshotEnvelope> { return { ...await engine.snapshot(), workerContinuation: { version: 1, ticksPerBatch: 1, batch: { remaining: 0, advanced: 0 } } } }
  private record(snapshot: WorkbenchSnapshotEnvelope): HostedRunRecord { return { protocolVersion: HOSTED_PROTOCOL_VERSION, runId: this.bootstrap.runId, ownerId: this.bootstrap.ownerId, savedAt: new Date().toISOString(), snapshot } }
  private async persistInitial(): Promise<void> { const snapshot = await this.snapshot(this.engine); await this.persist(this.record(snapshot), [], []) }
  private async commit(before: WorkbenchSnapshotEnvelope, after: WorkbenchSnapshotEnvelope, mutationId: string, events: readonly SimulationEvent[], statistics: readonly StatisticSample[], job?: HostedSimulationJob): Promise<'committed' | 'already-committed'> { const record = this.record(after); if (isMutationStore(this.store)) return this.store.commitRunMutation({ expectedTick: before.state.tick, expectedDigest: before.digest, mutationId, record, events, statistics, job }); await this.persist(record, events, statistics); if (job && isJobStore(this.store)) await this.store.saveJob(job); return 'committed' }
  private async restoreDurable(): Promise<SimulationEngine> { const record = await this.store.load(this.bootstrap.runId); if (!record) throw new Error('Hosted durable run disappeared after mutation commit'); return SimulationEngine.restore(record.snapshot) }
  private async observeUnqueued(): Promise<HostedRunObservation> { const snapshot = await this.snapshot(this.engine); return { tick: snapshot.state.tick, digest: snapshot.digest } }
  private async persist(record: HostedRunRecord, events: readonly SimulationEvent[], statistics: readonly StatisticSample[]): Promise<void> { if (isTelemetryStore(this.store)) await this.store.saveWithTelemetry(record, events, statistics); else await this.store.save(record) }
  private async serial<T>(operation: () => Promise<T>): Promise<T> { let result!: T; const queued = this.commandQueue.then(async () => { result = await operation() }); this.commandQueue = queued.then(() => undefined, () => undefined); await queued; return result }
  private authorize(ownerToken: string): void { if (ownerToken !== this.bootstrap.ownerToken) throw new Error('Hosted run authorization failed') }
}
function isTelemetryStore(store: HostedRunStore): store is HostedRunStore & HostedTelemetryStore { return 'saveWithTelemetry' in store && typeof store.saveWithTelemetry === 'function' }
function isMutationStore(store: HostedRunStore): store is HostedRunStore & HostedRunMutationStore { return 'commitRunMutation' in store && typeof store.commitRunMutation === 'function' }
function isJobStore(store: HostedRunStore): store is HostedRunStore & { saveJob(job: HostedSimulationJob): Promise<void> } { return 'saveJob' in store && typeof store.saveJob === 'function' }
function defaultViewport(width: number, height: number): MapProjectionRequest { return { revision: 0, bounds: { minQ: 0, maxQ: width - 1, minR: 0, maxR: height - 1 }, projectedHexRadius: 0, overlay: 'terrain' } }
function normalizeViewport(viewport: MapProjectionRequest): MapProjectionRequest { const { bounds } = viewport; if (!Number.isSafeInteger(viewport.revision) || viewport.revision < 0 || !Number.isSafeInteger(bounds.minQ) || !Number.isSafeInteger(bounds.maxQ) || !Number.isSafeInteger(bounds.minR) || !Number.isSafeInteger(bounds.maxR) || bounds.minQ > bounds.maxQ || bounds.minR > bounds.maxR || !Number.isFinite(viewport.projectedHexRadius) || viewport.projectedHexRadius < 0) throw new Error('Hosted viewport bounds are invalid'); return viewport }
function validateStoredRecord(record: HostedRunRecord, bootstrap: HostedRunBootstrap): void { validateHostedRunRecord(record); if (record.runId !== bootstrap.runId || record.ownerId !== bootstrap.ownerId) throw new Error('Hosted run record does not match its configured owner') }
function boundedSpeed(value: number): number { if (!Number.isSafeInteger(value)) throw new Error('Hosted speed must be a safe integer'); return Math.max(1, Math.min(8760, value)) }
function assertNever(value: never): never { throw new Error(`Unsupported hosted command: ${JSON.stringify(value)}`) }
