import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { HostedSimulationJobManager } from './jobs'
import { HostedRunService } from './runService'
import { MemoryHostedRunStore } from './store'

describe('hosted simulation jobs', () => {
  it('advances in persisted deterministic quanta and records checkpoint progress', async () => {
    const store = new MemoryHostedRunStore()
    const bootstrap = { runId: 'job-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('job-seed') }
    const manager = new HostedSimulationJobManager(await HostedRunService.open(bootstrap, store), store, 'owner', 'secret')
    await manager.start({ jobId: 'advance-week', totalTicks: 72, quantumTicks: 24, checkpointIntervalTicks: 48 })
    const completed = await manager.drain('advance-week')
    expect(completed).toMatchObject({ status: 'completed', advancedTicks: 72, lastCheckpointTick: 72 })
  })

  it('reconciles persisted advancement after a host restart without replaying ticks', async () => {
    const store = new MemoryHostedRunStore()
    const bootstrap = { runId: 'restart-job', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('restart-seed') }
    const firstService = await HostedRunService.open(bootstrap, store)
    const first = new HostedSimulationJobManager(firstService, store, 'owner', 'secret')
    await first.start({ jobId: 'resume', totalTicks: 48, quantumTicks: 24 })
    await firstService.execute('secret', { type: 'STEP', requestId: 'interrupted-quantum', count: 24 })
    const restarted = new HostedSimulationJobManager(await HostedRunService.open(bootstrap, store), store, 'owner', 'secret')
    const completed = await restarted.drain('resume')
    expect(completed.advancedTicks).toBe(48)
    expect(completed.status).toBe('completed')
  })

  it('cancels an unstarted job without changing the run', async () => {
    const store = new MemoryHostedRunStore()
    const bootstrap = { runId: 'cancel-job', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('cancel-seed') }
    const manager = new HostedSimulationJobManager(await HostedRunService.open(bootstrap, store), store, 'owner', 'secret')
    await manager.start({ jobId: 'cancelled', totalTicks: 24 })
    const cancelled = await manager.cancel('cancelled')
    expect((await manager.drain('cancelled')).status).toBe('cancelled')
    expect(cancelled.advancedTicks).toBe(0)
  })
})
