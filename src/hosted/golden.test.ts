import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { SimulationEngine } from '../simulation/engine/engine'
import { HostedRunService } from './runService'
import { MemoryHostedRunStore } from './store'

describe('browser/server authoritative golden fixture', () => {
  it('keeps the hosted executor on the same canonical result as direct engine execution', async () => {
    const creation = defaultWorldCreationRequest('cross-runtime-golden')
    const browserWorkerEquivalent = SimulationEngine.create(creation)
    browserWorkerEquivalent.advance(168)
    const expected = await browserWorkerEquivalent.snapshot()

    const store = new MemoryHostedRunStore()
    const host = await HostedRunService.open({ runId: 'golden', ownerId: 'owner', ownerToken: 'secret', creation }, store)
    await host.execute('secret', { type: 'STEP', requestId: 'golden-step', count: 168 })
    expect((await store.load('golden'))?.snapshot.digest).toBe(expected.digest)
  }, 30_000)
})
