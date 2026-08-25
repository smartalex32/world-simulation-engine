import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { HostedSimulationJobManager } from './jobs'
import { HostedRunService } from './runService'
import { MemoryHostedRunStore } from './store'
import { HOSTED_JOB_VERSION, type HostedSimulationJob } from './types'

function bootstrap(runId: string) {
  return {
    runId,
    ownerId: 'owner',
    ownerToken: 'secret',
    // Job ownership is the subject under test. A minimal valid world keeps
    // these timing-sensitive protocol tests fast on constrained CI runners.
    creation: { ...defaultWorldCreationRequest(`${runId}-seed`, 8, 8), initialPopulationCount: 1 },
  }
}

describe('hosted simulation jobs', () => {
  it('advances FIFO jobs in persisted deterministic quanta', async () => {
    const store = new MemoryHostedRunStore()
    const service = await HostedRunService.open(bootstrap('fifo'), store)
    const manager = new HostedSimulationJobManager(service, store, 'owner', 'secret')
    const [first, second] = await Promise.all([
      manager.start({ jobId: 'first', totalTicks: 48, quantumTicks: 24, checkpointIntervalTicks: 48 }),
      manager.start({ jobId: 'second', totalTicks: 24, quantumTicks: 24 }),
    ])
    const completed = await manager.drain(second.jobId)

    expect(first.queueOrder).toBeLessThan(second.queueOrder)
    expect((await manager.get(first.jobId))).toMatchObject({ status: 'completed', advancedTicks: 48 })
    expect(completed).toMatchObject({ status: 'completed', advancedTicks: 24, startTick: 48, committedTick: 72 })
    expect(await service.tick('secret')).toBe(72)
  })

  it('cancels a queued job without assigning its ticks to the run', async () => {
    const store = new MemoryHostedRunStore()
    const service = await HostedRunService.open(bootstrap('cancel'), store)
    const manager = new HostedSimulationJobManager(service, store, 'owner', 'secret')
    await manager.start({ jobId: 'first', totalTicks: 48, quantumTicks: 24 })
    await manager.start({ jobId: 'cancelled', totalTicks: 24 })
    const cancelled = await manager.cancel('cancelled')
    await manager.drain('first')

    expect(cancelled.status).toBe('cancelled')
    expect(await manager.get('cancelled')).toMatchObject({ status: 'cancelled', advancedTicks: 0 })
    expect(await service.tick('secret')).toBe(48)
  })

  it('finishes the active quantum before applying a running-job cancellation', async () => {
    const store = new MemoryHostedRunStore()
    const gate = deferred<{ tick: number; digest: string }>()
    let quantumStarted = false
    const service = {
      runId: () => 'boundary',
      observe: async () => ({ tick: 0, digest: 'initial-digest' }),
      advanceJob: async () => { quantumStarted = true; return gate.promise },
    } as unknown as HostedRunService
    const manager = new HostedSimulationJobManager(service, store, 'owner', 'secret')
    await manager.start({ jobId: 'boundary-cancel', totalTicks: 48, quantumTicks: 24 })
    await waitFor(() => quantumStarted)
    expect((await manager.cancel('boundary-cancel')).status).toBe('cancelling')
    gate.resolve({ tick: 24, digest: 'after-first-quantum' })

    expect(await manager.drain('boundary-cancel')).toMatchObject({ status: 'cancelled', advancedTicks: 24, committedTick: 24 })
  })

  it('marks a job failed instead of attributing direct run advancement to it', async () => {
    const store = new MemoryHostedRunStore()
    const service = await HostedRunService.open(bootstrap('conflict'), store)
    const manager = new HostedSimulationJobManager(service, store, 'owner', 'secret')
    const observation = await service.observe('secret')
    const now = new Date().toISOString()
    await store.saveJob({
      version: HOSTED_JOB_VERSION, jobId: 'resume', runId: 'conflict', ownerId: 'owner', status: 'running', queueOrder: 1,
      startTick: observation.tick, totalTicks: 48, advancedTicks: 0, committedTick: observation.tick, committedDigest: observation.digest,
      quantumTicks: 24, checkpointIntervalTicks: 24, lastCheckpointTick: observation.tick, createdAt: now, updatedAt: now,
    })
    await expect(manager.executeDirect({ type: 'STEP', requestId: 'blocked-step', count: 1 })).rejects.toThrow('owned by an active hosted job')
    await service.execute('secret', { type: 'STEP', requestId: 'outside-job', count: 24 })
    const failed = await manager.drain('resume')

    expect(failed).toMatchObject({ status: 'failed', advancedTicks: 0, failure: { code: 'run-state-conflict' } })
    expect(await service.tick('secret')).toBe(24)
  })

  it('reconciles a job-owned quantum persisted before a simulated crash', async () => {
    const store = new FailAfterRunCommitStore()
    const firstService = await HostedRunService.open(bootstrap('restart'), store)
    const first = new HostedSimulationJobManager(firstService, store, 'owner', 'secret')
    await first.start({ jobId: 'resume', totalTicks: 48, quantumTicks: 24 })
    await waitFor(() => first.failures().length > 0)

    const restarted = new HostedSimulationJobManager(await HostedRunService.open(bootstrap('restart'), store), store, 'owner', 'secret')
    const completed = await restarted.drain('resume')
    expect(completed).toMatchObject({ status: 'completed', advancedTicks: 48, committedTick: 48 })
  })
})

class FailAfterRunCommitStore extends MemoryHostedRunStore {
  private failed = false
  override async saveJob(job: HostedSimulationJob): Promise<void> {
    if (!this.failed && job.status === 'running' && job.advancedTicks > 0 && job.pendingQuantum === undefined) {
      this.failed = true
      throw new Error('Injected job record persistence failure')
    }
    await super.saveJob(job)
  }
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempts = 0; attempts < 100; attempts += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for hosted background work')
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>((done) => { resolve = done }), resolve }
}
