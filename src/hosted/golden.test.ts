import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { SimulationEngine } from '../simulation/engine/engine'
import { HostedRunService } from './runService'
import { MemoryHostedRunStore } from './store'
import { compareStableText } from '../shared/stableOrder'

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

  it('keeps punctuation, case, and numeric-looking IDs in stable cross-runtime order', async () => {
    const creation = defaultWorldCreationRequest('ordering-A_10.a')
    creation.settlements = [
      { id: 'settlement-z-2', name: 'Z', anchorCellId: '8,8' },
      { id: 'settlement-a-10', name: 'A', anchorCellId: '10,8' },
      { id: 'settlement-a-02', name: 'a', anchorCellId: '12,8' },
    ]
    const direct = SimulationEngine.create(creation); direct.advance(48)
    const expected = await direct.snapshot()
    const store = new MemoryHostedRunStore()
    const host = await HostedRunService.open({ runId: 'golden-ordering', ownerId: 'owner', ownerToken: 'secret', creation }, store)
    await host.execute('secret', { type: 'STEP', requestId: 'ordering-step', count: 48 })
    expect((await store.load('golden-ordering'))?.snapshot.digest).toBe(expected.digest)
    expect(['z-2', 'A_10', 'a-02'].sort(compareStableText)).toEqual(['A_10', 'a-02', 'z-2'])
  }, 30_000)
})
