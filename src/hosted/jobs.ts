import { HOSTED_JOB_VERSION, type HostedCommandResult, type HostedJobFailure, type HostedJobStore, type HostedRunCommand, type HostedSimulationJob } from './types'
import { HostedRunService, type HostedRunObservation } from './runService'

export interface HostedJobRequest {
  jobId: string
  totalTicks: number
  quantumTicks?: number
  checkpointIntervalTicks?: number
}

/**
 * One durable FIFO queue owns advancement for a hosted run. Every quantum is
 * written ahead of execution and committed against the exact prior tick/digest,
 * so restart recovery never attributes unrelated advancement to a job.
 */
export class HostedSimulationJobManager {
  private mutationQueue: Promise<void> = Promise.resolve()
  private processor: Promise<void> | undefined
  private readonly backgroundFailures: HostedJobFailure[] = []

  constructor(private readonly service: HostedRunService, private readonly store: HostedJobStore, private readonly ownerId: string, private readonly ownerToken: string) {}

  async start(request: HostedJobRequest): Promise<HostedSimulationJob> {
    validateRequest(request)
    const job = await this.mutate(async () => {
      const existing = await this.store.loadJob(this.service.runId(), request.jobId)
      if (existing) throw new Error(`Hosted job already exists: ${request.jobId}`)
      const observation = await this.service.observe(this.ownerToken)
      const jobs = await this.store.listJobs(this.service.runId())
      const now = new Date().toISOString()
      const created: HostedSimulationJob = {
        version: HOSTED_JOB_VERSION,
        jobId: request.jobId,
        runId: this.service.runId(),
        ownerId: this.ownerId,
        status: 'queued',
        queueOrder: Math.max(0, ...jobs.map((item) => item.queueOrder)) + 1,
        startTick: observation.tick,
        totalTicks: request.totalTicks,
        advancedTicks: 0,
        committedTick: observation.tick,
        committedDigest: observation.digest,
        quantumTicks: request.quantumTicks ?? 24,
        checkpointIntervalTicks: request.checkpointIntervalTicks ?? 168,
        lastCheckpointTick: observation.tick,
        createdAt: now,
        updatedAt: now,
      }
      await this.store.saveJob(created)
      return created
    })
    this.schedule()
    return job
  }

  async get(jobId: string): Promise<HostedSimulationJob | undefined> {
    const job = await this.store.loadJob(this.service.runId(), jobId)
    if (job !== undefined && job.ownerId !== this.ownerId) throw new Error(`Hosted job does not match configured owner: ${jobId}`)
    return job
  }

  async list(): Promise<HostedSimulationJob[]> {
    const jobs = await this.store.listJobs(this.service.runId())
    if (jobs.some((job) => job.ownerId !== this.ownerId)) throw new Error('Hosted job record does not match configured owner')
    return jobs
  }

  async cancel(jobId: string): Promise<HostedSimulationJob> {
    const updated = await this.mutate(async () => {
      const job = await this.required(jobId)
      if (isTerminal(job.status)) return job
      const status = job.status === 'queued' ? 'cancelled' as const : 'cancelling' as const
      const next = { ...job, status, updatedAt: new Date().toISOString() }
      await this.store.saveJob(next)
      return next
    })
    this.schedule()
    return updated
  }

  /** Embedding hosts/tests may drain explicitly; normal host execution yields between durable quanta. */
  async drain(jobId: string): Promise<HostedSimulationJob> {
    this.schedule()
    for (;;) {
      const job = await this.required(jobId)
      if (isTerminal(job.status)) return job
      await this.processor
    }
  }

  /** Restart recovery is intentionally idempotent: all pending records are rechecked before execution. */
  async resumePending(): Promise<HostedSimulationJob[]> {
    const pending = (await this.list()).filter((job) => !isTerminal(job.status))
    if (pending.length > 0) this.schedule()
    return pending
  }

  async hasActiveJobs(): Promise<boolean> { return (await this.list()).some((job) => !isTerminal(job.status)) }

  /** Serialize direct mutations with job creation so a run never has two advancement owners. */
  async executeDirect(command: HostedRunCommand): Promise<HostedCommandResult> {
    return this.mutate(async () => {
      if ((command.type === 'STEP' || command.type === 'RESET') && await this.hasActiveJobs()) {
        throw new Error('Hosted run advancement is owned by an active hosted job')
      }
      return this.service.execute(this.ownerToken, command)
    })
  }

  /** Inspectable host diagnostics for a storage failure that could not itself be persisted. */
  failures(): readonly HostedJobFailure[] { return this.backgroundFailures }

  private schedule(): void {
    if (this.processor) return
    this.processor = Promise.resolve().then(() => this.processQueue()).catch((error) => {
      this.backgroundFailures.push(failureFor(error))
    }).finally(() => { this.processor = undefined })
  }

  private async processQueue(): Promise<void> {
    for (;;) {
      const next = (await this.list()).find((job) => !isTerminal(job.status))
      if (!next) return
      await this.processOne(next.jobId)
    }
  }

  private async processOne(jobId: string): Promise<void> {
    let job = await this.required(jobId)
    if (isTerminal(job.status)) return
    if (job.status === 'queued') {
      // A queued job has no authoritative start state yet: earlier FIFO work
      // is expected to change the run before this job begins.
      job = await this.mutate(async () => {
        const latest = await this.required(jobId)
        if (latest.status !== 'queued') return latest
        const observation = await this.service.observe(this.ownerToken)
        return this.save({
          ...latest,
          status: 'running',
          startTick: observation.tick,
          committedTick: observation.tick,
          committedDigest: observation.digest,
          lastCheckpointTick: observation.tick,
          updatedAt: new Date().toISOString(),
        })
      })
      if (isTerminal(job.status)) return
    } else {
      job = await this.reconcile(job)
      if (isTerminal(job.status)) return
    }
    if (job.status === 'cancelling') {
      await this.save({ ...job, status: 'cancelled', pendingQuantum: undefined, updatedAt: new Date().toISOString() })
      return
    }

    const remaining = job.totalTicks - job.advancedTicks
    if (remaining <= 0) {
      await this.save({ ...job, status: 'completed', pendingQuantum: undefined, updatedAt: new Date().toISOString() })
      return
    }
    const count = Math.min(remaining, job.quantumTicks)
    const pending = { expectedTick: job.committedTick, expectedDigest: job.committedDigest, ticks: count }
    job = await this.save({ ...job, pendingQuantum: pending, updatedAt: new Date().toISOString() })

    let observation: HostedRunObservation
    try {
      observation = await this.service.advanceJob(this.ownerToken, { tick: pending.expectedTick, digest: pending.expectedDigest }, pending.ticks, (after) => completedQuantum(job, pending, after))
    } catch (error) {
      await this.fail(job, error)
      return
    }
    // A transactional store may already have persisted the transition. The
    // reconciliation helper recognizes that committed state without rewriting it.
    await this.commitQuantum(jobId, pending, observation)
  }

  private async reconcile(job: HostedSimulationJob): Promise<HostedSimulationJob> {
    const observation = await this.service.observe(this.ownerToken)
    if (!job.pendingQuantum) {
      if (observation.tick === job.committedTick && observation.digest === job.committedDigest) return job
      return this.fail(job, new Error('Hosted job run state conflict'))
    }
    if (observation.tick === job.pendingQuantum.expectedTick && observation.digest === job.pendingQuantum.expectedDigest) {
      return this.save({ ...job, pendingQuantum: undefined, updatedAt: new Date().toISOString() })
    }
    // A tick count alone is not evidence that this job owned the mutation.
    // Transactional stores persist the completed job with the same mutation;
    // legacy ambiguous records fail safely instead of stealing other work.
    return this.fail(job, new Error('Hosted job run state conflict'))
  }

  private async commitQuantum(jobId: string, pending: NonNullable<HostedSimulationJob['pendingQuantum']>, observation: HostedRunObservation): Promise<HostedSimulationJob> {
    return this.mutate(async () => {
      const latest = await this.required(jobId)
      if (!latest.pendingQuantum) return latest
      if (latest.pendingQuantum.expectedTick !== pending.expectedTick || latest.pendingQuantum.expectedDigest !== pending.expectedDigest) {
        return this.fail(latest, new Error('Hosted job run state conflict'))
      }
      return this.completeQuantum(latest, pending, observation)
    })
  }

  private async completeQuantum(job: HostedSimulationJob, pending: NonNullable<HostedSimulationJob['pendingQuantum']>, observation: HostedRunObservation): Promise<HostedSimulationJob> {
    const advancedTicks = job.advancedTicks + pending.ticks
    const completed = advancedTicks >= job.totalTicks
    const cancelled = job.status === 'cancelling'
    const checkpoint = completed || cancelled || observation.tick - job.lastCheckpointTick >= job.checkpointIntervalTicks
    return this.save({
      ...job,
      status: cancelled ? 'cancelled' : completed ? 'completed' : 'running',
      advancedTicks,
      committedTick: observation.tick,
      committedDigest: observation.digest,
      pendingQuantum: undefined,
      lastCheckpointTick: checkpoint ? observation.tick : job.lastCheckpointTick,
      updatedAt: new Date().toISOString(),
    })
  }

  private async fail(job: HostedSimulationJob, error: unknown): Promise<HostedSimulationJob> {
    const failure = failureFor(error)
    try {
      return await this.save({ ...job, status: 'failed', pendingQuantum: undefined, failure, updatedAt: new Date().toISOString() })
    } catch (persistenceError) {
      this.backgroundFailures.push(failureFor(persistenceError, 'persistence-failed'))
      throw persistenceError
    }
  }

  private async save(job: HostedSimulationJob): Promise<HostedSimulationJob> { await this.store.saveJob(job); return job }
  private async required(jobId: string): Promise<HostedSimulationJob> {
    const job = await this.get(jobId)
    if (!job) throw new Error(`Hosted job not found: ${jobId}`)
    return job
  }
  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    let result!: T
    const queued = this.mutationQueue.then(async () => { result = await operation() })
    this.mutationQueue = queued.then(() => undefined, () => undefined)
    await queued
    return result
  }
}

function isTerminal(status: HostedSimulationJob['status']): boolean { return status === 'cancelled' || status === 'completed' || status === 'failed' }
function completedQuantum(job: HostedSimulationJob, pending: NonNullable<HostedSimulationJob['pendingQuantum']>, observation: HostedRunObservation): HostedSimulationJob {
  const advancedTicks = job.advancedTicks + pending.ticks; const completed = advancedTicks >= job.totalTicks; const cancelled = job.status === 'cancelling'; const checkpoint = completed || cancelled || observation.tick - job.lastCheckpointTick >= job.checkpointIntervalTicks
  return { ...job, status: cancelled ? 'cancelled' : completed ? 'completed' : 'running', advancedTicks, committedTick: observation.tick, committedDigest: observation.digest, pendingQuantum: undefined, lastCheckpointTick: checkpoint ? observation.tick : job.lastCheckpointTick, updatedAt: new Date().toISOString() }
}

function failureFor(error: unknown, fallback: HostedJobFailure['code'] = 'advance-failed'): HostedJobFailure {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('run state conflict')) return { code: 'run-state-conflict', message: 'The authoritative run changed outside this job queue.' }
  if (fallback === 'persistence-failed') return { code: fallback, message: 'The job state could not be durably recorded.' }
  return { code: fallback, message: 'The job quantum could not be completed.' }
}

function validateRequest(request: HostedJobRequest): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(request.jobId)) throw new Error('Hosted job ID contains unsupported characters')
  for (const [name, value] of [['total ticks', request.totalTicks], ['quantum ticks', request.quantumTicks ?? 24], ['checkpoint interval', request.checkpointIntervalTicks ?? 168]] as const) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 8760) throw new Error(`Hosted job ${name} must be an integer from 1 through 8760`)
  }
}
