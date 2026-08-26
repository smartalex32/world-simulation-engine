import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { MemoryHostedRunStore } from './store'
import { HostedRunService } from './runService'

describe('hosted single-node run service', () => {
  it('serializes owner commands, persists snapshots, and restores the same authoritative result', async () => {
    const store = new MemoryHostedRunStore()
    const bootstrap = { runId: 'hosted-test', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('hosted-test-seed') }
    const first = await HostedRunService.open(bootstrap, store)

    const stepped = await first.execute('secret', { type: 'STEP', requestId: 'step-1', count: 24 })
    expect(stepped.observedTick).toBe(24)
    expect(stepped.responses.find((response) => response.type === 'FRAME')).toBeDefined()
    const snapshotResult = await first.execute('secret', { type: 'REQUEST_SNAPSHOT', requestId: 'snapshot-1' })
    const snapshot = snapshotResult.responses.find((response) => response.type === 'SNAPSHOT')
    expect(snapshot?.type).toBe('SNAPSHOT')
    if (snapshot?.type !== 'SNAPSHOT') throw new Error('Expected hosted snapshot response')

    const restored = await HostedRunService.open(bootstrap, store)
    const restoredSnapshot = await restored.execute('secret', { type: 'REQUEST_SNAPSHOT', requestId: 'snapshot-2' })
    const restoredEnvelope = restoredSnapshot.responses.find((response) => response.type === 'SNAPSHOT')
    expect(restoredEnvelope?.type).toBe('SNAPSHOT')
    if (restoredEnvelope?.type !== 'SNAPSHOT') throw new Error('Expected restored hosted snapshot response')
    expect(restoredEnvelope.snapshot.digest).toBe(snapshot.snapshot.digest)
  })

  it('rejects unauthorized commands and does not permit browser-provided state replacement', async () => {
    const service = await HostedRunService.open({ runId: 'hosted-auth', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('hosted-auth-seed') }, new MemoryHostedRunStore())
    await expect(service.execute('wrong', { type: 'STEP', requestId: 'step', count: 1 })).rejects.toThrow('authorization')
  })

  it('serializes concurrent commands in arrival order', async () => {
    const service = await HostedRunService.open({ runId: 'hosted-queue', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('hosted-queue-seed') }, new MemoryHostedRunStore())
    const results = await Promise.all([
      service.execute('secret', { type: 'STEP', requestId: 'step-1', count: 1 }),
      service.execute('secret', { type: 'STEP', requestId: 'step-2', count: 1 }),
    ])
    expect(results.map((result) => result.observedTick)).toEqual([1, 2])
  })

})
