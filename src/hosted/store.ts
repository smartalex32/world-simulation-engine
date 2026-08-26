import { validateHostedJob, validateHostedRunRecord, type HostedJobStore, type HostedSimulationJob, type HostedRunRecord, type HostedRunStore } from './types'
import { compareStableText } from '../shared/stableOrder'

/** In-memory store used only by tests and embedding hosts. */
export class MemoryHostedRunStore implements HostedRunStore, HostedJobStore {
  private readonly records = new Map<string, HostedRunRecord>()
  private readonly jobs = new Map<string, HostedSimulationJob>()

  async load(runId: string): Promise<HostedRunRecord | undefined> {
    const record = this.records.get(runId)
    return record === undefined ? undefined : validateHostedRunRecord(structuredClone(record))
  }

  async save(record: HostedRunRecord): Promise<void> {
    const valid = validateHostedRunRecord(record)
    this.records.set(valid.runId, structuredClone(valid))
  }
  async list(ownerId: string): Promise<HostedRunRecord[]> { return [...this.records.values()].map((record) => validateHostedRunRecord(structuredClone(record))).filter((record) => record.ownerId === ownerId).sort((a, b) => compareStableText(a.runId, b.runId)) }
  async loadJob(runId: string, jobId: string): Promise<HostedSimulationJob | undefined> {
    const job = this.jobs.get(jobKey(runId, jobId))
    return job === undefined ? undefined : validateHostedJob(structuredClone(job))
  }
  async saveJob(job: HostedSimulationJob): Promise<void> { const valid = validateHostedJob(job); this.jobs.set(jobKey(valid.runId, valid.jobId), structuredClone(valid)) }
  async listJobs(runId: string): Promise<HostedSimulationJob[]> {
    return [...this.jobs.values()].map((job) => validateHostedJob(structuredClone(job))).filter((job) => job.runId === runId).sort((a, b) => a.queueOrder - b.queueOrder || compareStableText(a.jobId, b.jobId))
  }
}

function jobKey(runId: string, jobId: string): string { return `${runId}:${jobId}` }
