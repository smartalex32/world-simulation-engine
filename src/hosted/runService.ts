import { NO_PROJECTION_INVALIDATION, WorkbenchProjectionBuilder, projectionInvalidationFromChangeSet, type MapProjectionRequest, type ProjectionInvalidation } from '../projection'
import { SimulationEngine } from '../simulation/engine/engine'
import { DEFAULT_PREINDUSTRIAL_PACK, createContentPackResolver, resolveContentPack, type ContentPack, type ContentPackCatalog, type ResolvedContentPack } from '../contentPacks'
import { canonicalStringify } from '../simulation/serialization/snapshot'
import { createHash } from 'node:crypto'
import type { SimulationEvent, StatisticSample } from '../simulation/domain/types'
import type { SimulationResponse, WorkbenchSnapshotEnvelope } from '../worker/protocol'
import { HOSTED_PROTOCOL_VERSION, validateHostedRunRecord, type HostedCommandResult, type HostedRunBootstrap, type HostedRunCommand, type HostedRunMutationStore, type HostedRunRecord, type HostedRunStore, type HostedRunView, type HostedSimulationJob, type HostedTelemetryStore } from './types'
import type { SharedWorldCommitRequest, SharedWorldCommitResult } from './sharedWorlds'

export interface HostedRunObservation { tick: number; digest: string }
export interface HostedTransactionalCommandResult { result: HostedCommandResult; outcome?: 'committed' | 'already-committed'; sharedWorld?: SharedWorldCommitResult }

/** Commands are evaluated against a restored candidate. The live engine changes
 * only after a durable compare-and-swap mutation has committed. */
export class HostedRunService {
  private projectionBuilder: WorkbenchProjectionBuilder
  private pendingProjectionInvalidation: ProjectionInvalidation = NO_PROJECTION_INVALIDATION
  private viewport: MapProjectionRequest
  private commandQueue: Promise<void> = Promise.resolve()
  private unreconciled = false
  private constructor(private readonly bootstrap: HostedRunBootstrap, private readonly store: HostedRunStore, private readonly contentPack: ResolvedContentPack, private engine: SimulationEngine) { const source = engine.project(); this.projectionBuilder = new WorkbenchProjectionBuilder(source); this.viewport = defaultViewport(source.world.grid.width, source.world.grid.height) }
  static async open(bootstrap: HostedRunBootstrap, store: HostedRunStore): Promise<HostedRunService> { const stored = await store.load(bootstrap.runId); if (stored) validateStoredRecord(stored, bootstrap); const contentPack = stored ? await resolveStoredContentPack(stored.snapshot, store, bootstrap.contentPack) : resolveContentPack(bootstrap.contentPack ?? DEFAULT_PREINDUSTRIAL_PACK); const service = new HostedRunService(bootstrap, store, contentPack, stored ? await SimulationEngine.restore(stored.snapshot, contentPack) : SimulationEngine.create(bootstrap.creation, 32, 24, contentPack)); if (!stored) await service.persistInitial(); return service }
  async execute(ownerToken: string, command: HostedRunCommand): Promise<HostedCommandResult> { return (await this.executeTransactional(ownerToken, command)).result }
  async executeTransactional(ownerToken: string, command: HostedRunCommand, sharedWorld?: Omit<SharedWorldCommitRequest, 'initialRun'>): Promise<HostedTransactionalCommandResult> { this.authorize(ownerToken); return this.serial(() => this.apply(command, sharedWorld)) }
  async view(ownerToken: string): Promise<HostedRunView> { this.authorize(ownerToken); await this.commandQueue; this.assertReconciled(); return { protocolVersion: HOSTED_PROTOCOL_VERSION, runId: this.bootstrap.runId, observedTick: this.engine.project().tick, projection: this.frame().projection } }
  runId(): string { return this.bootstrap.runId }
  async tick(ownerToken: string): Promise<number> { return (await this.observe(ownerToken)).tick }
  async observe(ownerToken: string): Promise<HostedRunObservation> { this.authorize(ownerToken); await this.commandQueue; this.assertReconciled(); const snapshot = await this.snapshot(this.engine); return { tick: snapshot.state.tick, digest: snapshot.digest } }
  /** The supplied job transition is committed with its snapshot and telemetry. */
  async advanceJob(ownerToken: string, expected: HostedRunObservation, count: number, jobFor?: (after: HostedRunObservation) => HostedSimulationJob): Promise<HostedRunObservation> { this.authorize(ownerToken); if (!Number.isSafeInteger(count) || count < 1) throw new Error('Hosted job step count must be a positive safe integer'); return this.serial(async () => { const before = await this.snapshot(this.engine); if (before.state.tick !== expected.tick || before.digest !== expected.digest) throw new Error('Hosted job run state conflict'); const candidate = await SimulationEngine.restore(before, this.contentPack); const result = candidate.advance(count); const after = await this.snapshot(candidate); const observation = { tick: after.state.tick, digest: after.digest }; const job = jobFor?.(observation); const id = `job:${job ? `${job.jobId}:${expected.digest}` : `${expected.digest}:${count}`}`; const mutationFingerprint = createHash('sha256').update(canonicalStringify({ id, count, expected, jobId: job?.jobId })).digest('hex'); const committed = await this.commit(before, after, id, mutationFingerprint, result.events, result.statistics, job); this.replaceEngine(committed.outcome === 'already-committed' ? await this.restoreDurable() : candidate, false, projectionInvalidationFromChangeSet(result.changeSet)); return committed.outcome === 'already-committed' ? await this.observeUnqueued() : observation }) }
  private async apply(command: HostedRunCommand, sharedWorld?: Omit<SharedWorldCommitRequest, 'initialRun'>): Promise<HostedTransactionalCommandResult> {
    if (command.type === 'SET_VIEWPORT') { this.viewport = normalizeViewport(command.viewport); return { result: this.result([this.frame(command.requestId)]) } }
    if (command.type === 'REQUEST_SNAPSHOT') { const snapshot = await this.snapshot(this.engine); return { result: this.result([{ type: 'SNAPSHOT', requestId: command.requestId, snapshot }, this.frame(command.requestId)]) } }
    if (command.type === 'PAUSE') return { result: this.result([{ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch: 1 }]) }
    if (command.type === 'SET_SPEED') return { result: this.result([{ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch: boundedSpeed(command.ticksPerBatch) }]) }
    const before = await this.snapshot(this.engine); const candidate = command.type === 'RESET' ? SimulationEngine.create(this.bootstrap.creation, 32, 24, this.contentPack) : await SimulationEngine.restore(before, this.contentPack); const events: SimulationEvent[] = []; const statistics: StatisticSample[] = []; let projectionInvalidation: ProjectionInvalidation = NO_PROJECTION_INVALIDATION
    if (command.type === 'STEP') { const count = command.count ?? 1; if (!Number.isSafeInteger(count) || count < 1) throw new Error('Hosted step count must be a positive safe integer'); const result = candidate.advance(count); events.push(...result.events); statistics.push(...result.statistics); projectionInvalidation = projectionInvalidationFromChangeSet(result.changeSet) }
    else if (command.type === 'MATERIALIZE_COHORT') { const result = candidate.materializeCohort(command.cohortId, command.populationCount); events.push(result.event); projectionInvalidation = projectionInvalidationFromChangeSet(result.changeSet) }
    else if (command.type === 'DEMATERIALIZE_PEOPLE') { const result = candidate.dematerializePeople(command.personIds); events.push(result.event); projectionInvalidation = projectionInvalidationFromChangeSet(result.changeSet) }
    else if (command.type === 'SET_PROTECTED_PEOPLE') candidate.protectDetailedPeople(command.personIds)
    else if (command.type === 'RESET') { const snapshot = await this.snapshot(candidate); events.push(candidate.event('RUN_CREATED', { seed: snapshot.state.config.seed, width: snapshot.state.config.worldWidth, height: snapshot.state.config.worldHeight, population: snapshot.state.people.length, worldName: snapshot.state.world.name })) }
    else assertNever(command)
    const after = await this.snapshot(candidate); const committed = await this.commit(before, after, `command:${command.requestId}`, fingerprint(command), events, statistics, undefined, sharedWorld); this.replaceEngine(committed.outcome === 'already-committed' ? await this.restoreDurable() : candidate, command.type === 'RESET')
    const responses: SimulationResponse[] = [this.frame(command.requestId, committed.outcome === 'already-committed' ? [] : events, committed.outcome === 'already-committed' ? [] : statistics, committed.outcome === 'already-committed' ? NO_PROJECTION_INVALIDATION : projectionInvalidation)]; if (command.type === 'STEP' || command.type === 'RESET') responses.push({ type: 'STATUS', requestId: command.requestId, status: 'paused', ticksPerBatch: 1 }); return { result: this.result(responses), outcome: committed.outcome, ...(committed.sharedWorld ? { sharedWorld: committed.sharedWorld } : {}) }
  }
  private result(responses: SimulationResponse[]): HostedCommandResult { return { protocolVersion: HOSTED_PROTOCOL_VERSION, runId: this.bootstrap.runId, observedTick: this.engine.project().tick, responses } }
  private replaceEngine(engine: SimulationEngine, resetViewport = false, invalidation: ProjectionInvalidation = NO_PROJECTION_INVALIDATION): void { this.engine = engine; this.pendingProjectionInvalidation = invalidation; const source = engine.project(); if (resetViewport) { this.projectionBuilder = new WorkbenchProjectionBuilder(source); this.viewport = defaultViewport(source.world.grid.width, source.world.grid.height) } }
  private frame(requestId?: string, events: SimulationEvent[] = [], statistics: StatisticSample[] = [], projectionInvalidation: ProjectionInvalidation = this.pendingProjectionInvalidation): Extract<SimulationResponse, { type: 'FRAME' }> { this.pendingProjectionInvalidation = NO_PROJECTION_INVALIDATION; return { type: 'FRAME', requestId, projection: this.projectionBuilder.build(this.engine.project(), this.viewport, undefined, 0, projectionInvalidation), events, statistics, processingMs: 0, projectionInvalidation } }
  private async snapshot(engine: SimulationEngine): Promise<WorkbenchSnapshotEnvelope> { return { ...await engine.snapshot(), workerContinuation: { version: 1, ticksPerBatch: 1, batch: { remaining: 0, advanced: 0 } } } }
  private record(snapshot: WorkbenchSnapshotEnvelope): HostedRunRecord { return { protocolVersion: HOSTED_PROTOCOL_VERSION, runId: this.bootstrap.runId, ownerId: this.bootstrap.ownerId, savedAt: new Date().toISOString(), snapshot } }
  private async persistInitial(): Promise<void> { const snapshot = await this.snapshot(this.engine); await this.persist(this.record(snapshot), [], []) }
  private async commit(before: WorkbenchSnapshotEnvelope, after: WorkbenchSnapshotEnvelope, mutationId: string, mutationFingerprint: string, events: readonly SimulationEvent[], statistics: readonly StatisticSample[], job?: HostedSimulationJob, sharedWorld?: Omit<SharedWorldCommitRequest, 'initialRun'>) { const record = this.record(after); if (!isMutationStore(this.store)) throw new Error('Hosted authoritative storage must support transactional mutations'); return this.store.commitRunMutation({ expectedTick: before.state.tick, expectedDigest: before.digest, mutationId, mutationFingerprint, record, events, statistics, job, sharedWorld }) }
  private async restoreDurable(): Promise<SimulationEngine> { const record = await this.store.load(this.bootstrap.runId); if (!record) throw new Error('Hosted durable run disappeared after mutation commit'); return SimulationEngine.restore(record.snapshot, this.contentPack) }
  private async observeUnqueued(): Promise<HostedRunObservation> { const snapshot = await this.snapshot(this.engine); return { tick: snapshot.state.tick, digest: snapshot.digest } }
  private async persist(record: HostedRunRecord, events: readonly SimulationEvent[], statistics: readonly StatisticSample[]): Promise<void> { if (isTelemetryStore(this.store)) await this.store.saveWithTelemetry(record, events, statistics); else await this.store.save(record) }
  private async serial<T>(operation: () => Promise<T>): Promise<T> { let result!: T; const queued = this.commandQueue.then(async () => { this.assertReconciled(); try { result = await operation() } catch (error) { try { this.replaceEngine(await this.restoreDurable()) } catch { this.unreconciled = true } throw error } }); this.commandQueue = queued.then(() => undefined, () => undefined); await queued; return result }
  private authorize(ownerToken: string): void { if (ownerToken !== this.bootstrap.ownerToken) throw new Error('Hosted run authorization failed') }
  private assertReconciled(): void { if (this.unreconciled) throw new Error('Hosted authority is unreconciled; restart or restore durable state before continuing') }
}
function isTelemetryStore(store: HostedRunStore): store is HostedRunStore & HostedTelemetryStore { return 'saveWithTelemetry' in store && typeof store.saveWithTelemetry === 'function' }
function isMutationStore(store: HostedRunStore): store is HostedRunStore & HostedRunMutationStore { return 'commitRunMutation' in store && typeof store.commitRunMutation === 'function' }
function defaultViewport(width: number, height: number): MapProjectionRequest { return { revision: 0, bounds: { minQ: 0, maxQ: width - 1, minR: 0, maxR: height - 1 }, projectedHexRadius: 0, overlay: 'terrain' } }
function normalizeViewport(viewport: MapProjectionRequest): MapProjectionRequest { const { bounds } = viewport; if (!Number.isSafeInteger(viewport.revision) || viewport.revision < 0 || !Number.isSafeInteger(bounds.minQ) || !Number.isSafeInteger(bounds.maxQ) || !Number.isSafeInteger(bounds.minR) || !Number.isSafeInteger(bounds.maxR) || bounds.minQ > bounds.maxQ || bounds.minR > bounds.maxR || !Number.isFinite(viewport.projectedHexRadius) || viewport.projectedHexRadius < 0) throw new Error('Hosted viewport bounds are invalid'); return viewport }
function validateStoredRecord(record: HostedRunRecord, bootstrap: HostedRunBootstrap): void { validateHostedRunRecord(record); if (record.runId !== bootstrap.runId || record.ownerId !== bootstrap.ownerId) throw new Error('Hosted run record does not match its configured owner') }
function boundedSpeed(value: number): number { if (!Number.isSafeInteger(value)) throw new Error('Hosted speed must be a safe integer'); return Math.max(1, Math.min(8760, value)) }
function assertNever(value: never): never { throw new Error(`Unsupported hosted command: ${JSON.stringify(value)}`) }
function fingerprint(command: HostedRunCommand): string { return createHash('sha256').update(canonicalStringify(command)).digest('hex') }

async function resolveStoredContentPack(snapshot: WorkbenchSnapshotEnvelope, store: HostedRunStore, supplied?: ResolvedContentPack): Promise<ResolvedContentPack> {
  const config = snapshot.state.config
  if (supplied) return resolveContentPack(supplied)
  if (config.contentPackId === DEFAULT_PREINDUSTRIAL_PACK.manifest.id && config.contentPackVersion === DEFAULT_PREINDUSTRIAL_PACK.manifest.version) return resolveContentPack(DEFAULT_PREINDUSTRIAL_PACK)
  if (!isContentPackCatalog(store)) throw new Error(`Hosted snapshot content pack is unavailable: ${config.contentPackId}@${config.contentPackVersion}`)
  const packs: ContentPack[] = [DEFAULT_PREINDUSTRIAL_PACK]
  const visiting = new Set<string>()
  const load = async (id: string, version: string): Promise<void> => {
    const key = `${id}@${version}`
    if (visiting.has(key)) return
    visiting.add(key)
    const pack = id === DEFAULT_PREINDUSTRIAL_PACK.manifest.id && version === DEFAULT_PREINDUSTRIAL_PACK.manifest.version ? DEFAULT_PREINDUSTRIAL_PACK : await store.getPack(id, version)
    if (!pack) throw new Error(`Hosted snapshot content pack is unavailable: ${key}`)
    packs.push(pack)
    for (const dependency of pack.manifest.dependencies) await load(dependency.id, dependency.version)
  }
  await load(config.contentPackId, config.contentPackVersion)
  return createContentPackResolver(packs).resolve(config.contentPackId, config.contentPackVersion)
}
function isContentPackCatalog(store: HostedRunStore): store is HostedRunStore & ContentPackCatalog { return 'getPack' in store && typeof (store as Partial<ContentPackCatalog>).getPack === 'function' }

/** Builds a run's initial durable record without writing it, allowing shared
 * run registration, audit, outbox, and the canonical snapshot to share one transaction. */
export async function prepareHostedRunRecord(bootstrap: HostedRunBootstrap, savedAt: string): Promise<HostedRunRecord> {
  const engine = SimulationEngine.create(bootstrap.creation, 32, 24, resolveContentPack(bootstrap.contentPack ?? DEFAULT_PREINDUSTRIAL_PACK))
  const snapshot: WorkbenchSnapshotEnvelope = { ...await engine.snapshot(), workerContinuation: { version: 1, ticksPerBatch: 1, batch: { remaining: 0, advanced: 0 } } }
  return validateHostedRunRecord({ protocolVersion: HOSTED_PROTOCOL_VERSION, runId: bootstrap.runId, ownerId: bootstrap.ownerId, savedAt, snapshot })
}
