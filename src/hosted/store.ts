import { validateHostedJob, validateHostedRunRecord, type HostedJobStore, type HostedRunMutation, type HostedRunMutationResult, type HostedRunMutationStore, type HostedSimulationJob, type HostedRunRecord, type HostedRunStore } from './types'
import { compareStableText } from '../shared/stableOrder'
import { SharedWorldService, type SharedOutboxEvent, type SharedWorldCommitRequest, type SharedWorldCommitResult, type SharedWorldMutationStore, type SharedWorldServiceState } from './sharedWorlds'

/** In-memory store used only by tests and embedding hosts. */
export class MemoryHostedRunStore implements HostedRunStore, HostedJobStore, HostedRunMutationStore, SharedWorldMutationStore {
  private readonly records = new Map<string, HostedRunRecord>()
  private readonly jobs = new Map<string, HostedSimulationJob>()
  private readonly mutations = new Map<string, { digest: string; fingerprint: string }>()
  private sharedState: SharedWorldServiceState = new SharedWorldService().snapshotState()
  private sharedRevision = 0
  private readonly outbox: SharedOutboxEvent[] = []
  private readonly outboxByKey = new Map<string, SharedOutboxEvent>()

  async load(runId: string): Promise<HostedRunRecord | undefined> {
    const record = this.records.get(runId)
    return record === undefined ? undefined : validateHostedRunRecord(structuredClone(record))
  }

  async save(record: HostedRunRecord): Promise<void> {
    const valid = validateHostedRunRecord(record)
    this.records.set(valid.runId, structuredClone(valid))
  }
  async commitRunMutation(mutation: HostedRunMutation): Promise<HostedRunMutationResult> {
    const record = validateHostedRunRecord(mutation.record)
    const key = `${record.runId}:${mutation.mutationId}`
    const previous = this.mutations.get(key)
    if (previous !== undefined) { if (previous.fingerprint !== mutation.mutationFingerprint) throw new Error('Hosted mutation ID was reused with a different request'); return { outcome: 'already-committed' } }
    const current = this.records.get(record.runId)
    if (!current || current.snapshot.state.tick !== mutation.expectedTick || current.snapshot.digest !== mutation.expectedDigest) throw new Error('Hosted job run state conflict')
    const job = mutation.job ? this.validateJobCandidate(mutation.job, mutation.job.recordRevision - 1) : undefined
    const shared = mutation.sharedWorld ? this.prepareSharedWorldCandidate(mutation.sharedWorld) : undefined
    if (job) this.jobs.set(jobKey(job.runId, job.jobId), structuredClone(job))
    if (shared) this.applySharedWorldCandidate(shared)
    this.records.set(record.runId, structuredClone(record))
    this.mutations.set(key, { digest: record.snapshot.digest, fingerprint: mutation.mutationFingerprint })
    return { outcome: 'committed', ...(shared ? { sharedWorld: shared.result } : {}) }
  }
  async list(ownerId: string): Promise<HostedRunRecord[]> { return [...this.records.values()].map((record) => validateHostedRunRecord(structuredClone(record))).filter((record) => record.ownerId === ownerId).sort((a, b) => compareStableText(a.runId, b.runId)) }
  async loadJob(runId: string, jobId: string): Promise<HostedSimulationJob | undefined> {
    const job = this.jobs.get(jobKey(runId, jobId))
    return job === undefined ? undefined : validateHostedJob(structuredClone(job))
  }
  async saveJob(job: HostedSimulationJob, expectedRecordRevision: number): Promise<void> { const valid = this.validateJobCandidate(job, expectedRecordRevision); this.jobs.set(jobKey(valid.runId, valid.jobId), structuredClone(valid)) }
  async listJobs(runId: string): Promise<HostedSimulationJob[]> {
    return [...this.jobs.values()].map((job) => validateHostedJob(structuredClone(job))).filter((job) => job.runId === runId).sort((a, b) => a.queueOrder - b.queueOrder || compareStableText(a.jobId, b.jobId))
  }
  async loadSharedWorldService(): Promise<SharedWorldService> { return SharedWorldService.restore(structuredClone(this.sharedState), this.sharedRevision) }
  async commitSharedWorldMutation(request: SharedWorldCommitRequest): Promise<SharedWorldCommitResult> { return this.commitSharedWorldCandidate(request) }
  async outboxAfter(lastEventId = 0): Promise<readonly SharedOutboxEvent[]> {
    if (!Number.isSafeInteger(lastEventId) || lastEventId < 0) throw new Error('Last-Event-ID is invalid')
    return this.outbox.filter((event) => event.id > lastEventId).map((event) => structuredClone(event))
  }
  private validateJobCandidate(job: HostedSimulationJob, expectedRecordRevision: number): HostedSimulationJob {
    const valid = validateHostedJob(job); const current = this.jobs.get(jobKey(valid.runId, valid.jobId))
    if ((current?.recordRevision ?? 0) !== expectedRecordRevision || valid.recordRevision !== expectedRecordRevision + 1) throw new Error('Hosted job state conflict')
    return valid
  }
  private commitSharedWorldCandidate(request: Omit<SharedWorldCommitRequest, 'initialRun'>): SharedWorldCommitResult
  private commitSharedWorldCandidate(request: SharedWorldCommitRequest): SharedWorldCommitResult {
    const prepared = this.prepareSharedWorldCandidate(request); this.applySharedWorldCandidate(prepared); return prepared.result
  }
  private prepareSharedWorldCandidate(request: Omit<SharedWorldCommitRequest, 'initialRun'> | SharedWorldCommitRequest) {
    if (request.expectedRevision !== this.sharedRevision || request.service.storageRevision() !== request.expectedRevision) throw new Error('Shared world state conflict')
    const state = request.service.snapshotState(); SharedWorldService.restore(state, request.expectedRevision)
    const initialRun = 'initialRun' in request && request.initialRun ? validateHostedRunRecord(request.initialRun) : undefined
    if (initialRun && this.records.has(initialRun.runId)) throw new Error('Hosted run state conflict')
    const nextRevision = this.sharedRevision + 1
    let event: SharedOutboxEvent | undefined
    if (request.event) {
      event = this.outboxByKey.get(request.event.key)
      if (!event) event = Object.freeze({ id: this.outbox.length + 1, key: request.event.key, topic: request.event.topic, payload: structuredClone(request.event.payload), createdAt: request.event.occurredAt })
    }
    return { state, initialRun, event, result: { revision: nextRevision, ...(event ? { event: structuredClone(event) } : {}) } }
  }
  private applySharedWorldCandidate(prepared: ReturnType<MemoryHostedRunStore['prepareSharedWorldCandidate']>): void {
    this.sharedState = structuredClone(prepared.state); this.sharedRevision = prepared.result.revision
    if (prepared.initialRun) this.records.set(prepared.initialRun.runId, structuredClone(prepared.initialRun))
    if (prepared.event && !this.outboxByKey.has(prepared.event.key)) { this.outbox.push(prepared.event); this.outboxByKey.set(prepared.event.key, prepared.event) }
  }
}

function jobKey(runId: string, jobId: string): string { return `${runId}:${jobId}` }
