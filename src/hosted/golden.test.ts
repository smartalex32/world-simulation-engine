import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { SimulationEngine } from '../simulation/engine/engine'
import { WorkbenchProjectionBuilder } from '../projection'
import { SimulationApplicationService } from '../runtime/simulationApplicationService'
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

  it('keeps the application and hosted adapters on one command result contract', async () => {
    const creation = defaultWorldCreationRequest('adapter-contract-golden')
    const browserEngine = SimulationEngine.create(creation)
    const application = new SimulationApplicationService()
    const command = { type: 'STEP' as const, requestId: 'adapter-step', count: 24 }
    const browserResult = application.execute(command, { engine: browserEngine })
    const browserSnapshot = await browserEngine.snapshot()
    const browserProjection = new WorkbenchProjectionBuilder(SimulationEngine.create(creation).project()).build(browserEngine.project(), {
      revision: 0, bounds: { minQ: 0, maxQ: 31, minR: 0, maxR: 23 }, projectedHexRadius: 0, overlay: 'terrain',
    }, undefined, 0, browserResult.projectionInvalidation)

    const store = new MemoryHostedRunStore()
    const hosted = await HostedRunService.open({ runId: 'adapter-contract', ownerId: 'owner', ownerToken: 'secret', creation }, store)
    const hostedResult = await hosted.execute('secret', command)
    const frame = hostedResult.responses.find((response) => response.type === 'FRAME')
    expect(frame?.type).toBe('FRAME')
    if (frame?.type !== 'FRAME') throw new Error('Expected hosted frame')
    expect((await store.load('adapter-contract'))?.snapshot.digest).toBe(browserSnapshot.digest)
    expect(frame.events).toEqual(browserResult.events)
    expect(frame.statistics).toEqual(browserResult.statistics)
    expect(frame.projection).toEqual(browserProjection)
    expect(hostedResult.responses).toContainEqual({ type: 'ACK', requestId: command.requestId, command: command.type })
  }, 30_000)

  it('keeps identical multi-command sequences deterministic across browser and hosted adapters', async () => {
    const creation = defaultWorldCreationRequest('adapter-sequence-golden')
    const browserEngine = SimulationEngine.create(creation)
    const application = new SimulationApplicationService()
    const store = new MemoryHostedRunStore()
    const hosted = await HostedRunService.open({ runId: 'adapter-sequence', ownerId: 'owner', ownerToken: 'secret', creation }, store)
    const commands = [
      { type: 'STEP' as const, requestId: 'sequence-step-1', count: 12 },
      { type: 'SET_PROTECTED_PEOPLE' as const, requestId: 'sequence-protect', personIds: ['person-0001'] },
      { type: 'STEP' as const, requestId: 'sequence-step-2', count: 36 },
    ]

    for (const command of commands) {
      const browser = application.execute(command, { engine: browserEngine })
      const server = await hosted.execute('secret', command)
      const frame = server.responses.find((response) => response.type === 'FRAME')
      expect(frame?.type).toBe('FRAME')
      if (frame?.type !== 'FRAME') throw new Error('Expected hosted frame')
      expect(frame.events).toEqual(browser.events)
      expect(frame.statistics).toEqual(browser.statistics)
      expect(server.responses).toContainEqual({ type: 'ACK', requestId: command.requestId, command: command.type })
      expect((await store.load('adapter-sequence'))?.snapshot.digest).toBe((await browserEngine.snapshot()).digest)
    }
  }, 30_000)
})
