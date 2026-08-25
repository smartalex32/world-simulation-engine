import { HOSTED_JOB_VERSION, type HostedJobStore, type HostedSimulationJob } from './types'
import { HostedRunService } from './runService'

export interface HostedJobRequest {
  jobId: string
  totalTicks: number
  quantumTicks?: number
  checkpointIntervalTicks?: number
}

/**
 * Advances a server-owned run in persisted, deterministic quanta. Wall-clock
 * scheduling only chooses when a quantum starts; it never changes outcomes.
 */
export class HostedSimulationJobManager {
  private readonly active = new Set<string>()

  constructor(private readonly service: HostedRunService, private readonly store: HostedJobStore, private readonly ownerId: string, private readonly ownerToken: string) {}

  async start(request: HostedJobRequest): Promise<HostedSimulationJob> {
    validateRequest(request)
    const existing = await this.store.loadJob(this.service.runId(), request.jobId)
    if (existing) throw new Error(`Hosted job already exists: ${request.jobId}`)
    const now = new Date().toISOString()
    const job: HostedSimulationJob = {
      version: HOSTED_JOB_VERSION, jobId: request.jobId, runId: this.service.runId(), ownerId: this.ownerId, status: 'queued',
      startTick: await this.service.tick(this.ownerToken), totalTicks: request.totalTicks, advancedTicks: 0,
      quantumTicks: request.quantumTicks ?? 24, checkpointIntervalTicks: request.checkpointIntervalTicks ?? 168,
      lastCheckpointTick: 0, createdAt: now, updatedAt: now,
    }
    await this.store.saveJob(job)
    this.schedule(job.jobId)
    return job
  }

  async get(jobId: string): Promise<HostedSimulationJob | undefined> { return this.store.loadJob(this.service.runId(), jobId) }
  async list(): Promise<HostedSimulationJob[]> { return this.store.listJobs(this.service.runId()) }

  async cancel(jobId: string): Promise<HostedSimulationJob> {
    const job = await this.required(jobId)
    if (job.status === 'completed') return job
    const cancelled = { ...job, status: 'cancelled' as const, updatedAt: new Date().toISOString() }
    await this.store.saveJob(cancelled)
    return cancelled
  }

  /** Embedding hosts/tests may drain explicitly; normal host execution yields between quanta. */
  async drain(jobId: string): Promise<HostedSimulationJob> {
    const key = `${this.service.runId()}:${jobId}`
    if (this.active.has(key)) return this.required(jobId)
    this.active.add(key)
    try {
      for (;;) {
        const current = await this.required(jobId)
        const reconciled = await this.reconcile(current)
        if (reconciled.status === 'cancelled' || reconciled.status === 'completed') return reconciled
        const remaining = reconciled.totalTicks - reconciled.advancedTicks
        const count = Math.min(remaining, reconciled.quantumTicks)
        await this.service.execute(this.ownerToken, { type: 'STEP', requestId: `job-${jobId}-${reconciled.advancedTicks}`, count })
        const observedTick = await this.service.tick(this.ownerToken)
        const advancedTicks = observedTick - reconciled.startTick
        const completed = advancedTicks >= reconciled.totalTicks
        const checkpoint = completed || observedTick - reconciled.lastCheckpointTick >= reconciled.checkpointIntervalTicks
        const next: HostedSimulationJob = {
          ...reconciled, status: completed ? 'completed' : 'running', advancedTicks,
          lastCheckpointTick: checkpoint ? observedTick : reconciled.lastCheckpointTick, updatedAt: new Date().toISOString(),
        }
        await this.store.saveJob(next)
        if (completed) return next
      }
    } finally { this.active.delete(key) }
  }

  resumePending(): Promise<HostedSimulationJob[]> {
    return this.list().then((jobs) => Promise.all(jobs.filter((job) => job.status === 'queued' || job.status === 'running').map(async (job) => {
      this.schedule(job.jobId)
      return job
    })))
  }

  private schedule(jobId: string): void { setTimeout(() => { void this.drain(jobId) }, 0) }
  private async required(jobId: string): Promise<HostedSimulationJob> {
    const job = await this.get(jobId)
    if (!job || job.ownerId !== this.ownerId) throw new Error(`Hosted job not found: ${jobId}`)
    return job
  }
  private async reconcile(job: HostedSimulationJob): Promise<HostedSimulationJob> {
    const advancedTicks = Math.max(0, (await this.service.tick(this.ownerToken)) - job.startTick)
    if (advancedTicks === job.advancedTicks) return job
    const next = { ...job, advancedTicks, status: advancedTicks >= job.totalTicks ? 'completed' as const : job.status, updatedAt: new Date().toISOString() }
    await this.store.saveJob(next)
    return next
  }
}

function validateRequest(request: HostedJobRequest): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(request.jobId)) throw new Error('Hosted job ID contains unsupported characters')
  for (const [name, value] of [['total ticks', request.totalTicks], ['quantum ticks', request.quantumTicks ?? 24], ['checkpoint interval', request.checkpointIntervalTicks ?? 168]] as const) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 8760) throw new Error(`Hosted job ${name} must be an integer from 1 through 8760`)
  }
}
