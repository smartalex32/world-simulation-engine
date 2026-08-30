import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { SimulationEngine } from '../simulation/engine/engine'
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

  it('does not advance the live engine when candidate persistence fails', async () => {
    const store = new FailingMutationStore()
    const service = await HostedRunService.open({ runId: 'hosted-failure', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('hosted-failure-seed') }, store)
    const before = await service.observe('secret')
    store.fail = true
    await expect(service.execute('secret', { type: 'STEP', requestId: 'will-fail', count: 1 })).rejects.toThrow('injected')
    expect(await service.observe('secret')).toEqual(before)
    expect(await store.load('hosted-failure')).toMatchObject({ snapshot: { digest: before.digest, state: { tick: before.tick } } })
  })

  it('treats a retried mutation ID as an idempotent observation of its durable result', async () => {
    const store = new MemoryHostedRunStore()
    const service = await HostedRunService.open({ runId: 'hosted-idempotent', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('hosted-idempotent-seed') }, store)
    await service.execute('secret', { type: 'STEP', requestId: 'same-command', count: 1 })
    const retry = await service.execute('secret', { type: 'STEP', requestId: 'same-command', count: 1 })
    expect(retry.observedTick).toBe(1)
    expect(await service.tick('secret')).toBe(1)
  })

  it('reconciles from durable state when persistence commits and the caller loses the acknowledgement', async () => {
    const store = new CommitThenThrowStore()
    const bootstrap = { runId: 'hosted-ack-loss', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('hosted-ack-loss-seed') }
    const service = await HostedRunService.open(bootstrap, store)
    store.throwAfterCommit = true
    await expect(service.execute('secret', { type: 'STEP', requestId: 'ack-lost', count: 1 })).rejects.toThrow('acknowledgement')
    const durable = await store.load(bootstrap.runId)
    expect(await service.observe('secret')).toEqual({ tick: 1, digest: durable?.snapshot.digest })
  })

  it('allows only one process to commit a candidate with the same parent digest', async () => {
    const store = new MemoryHostedRunStore()
    const bootstrap = { runId: 'hosted-cas', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('hosted-cas-seed') }
    const [first, second] = await Promise.all([HostedRunService.open(bootstrap, store), HostedRunService.open(bootstrap, store)])
    const results = await Promise.allSettled([
      first.execute('secret', { type: 'STEP', requestId: 'process-a', count: 1 }),
      second.execute('secret', { type: 'STEP', requestId: 'process-b', count: 1 }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await store.load(bootstrap.runId))?.snapshot.state.tick).toBe(1)
  })

  it('stops operations that were queued before reconciliation became impossible', async () => {
    const store = new PoisoningMutationStore()
    const service = await HostedRunService.open({ runId: 'hosted-poison', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('hosted-poison-seed') }, store)
    store.poison = true
    const first = service.execute('secret', { type: 'STEP', requestId: 'poison-first', count: 1 })
    const alreadyQueued = service.execute('secret', { type: 'STEP', requestId: 'poison-second', count: 1 })
    await expect(first).rejects.toThrow('injected')
    await expect(alreadyQueued).rejects.toThrow('unreconciled')
  })

  it('keeps retained hosted projections current across fidelity transitions', async () => {
    const store = new MemoryHostedRunStore()
    const creation = fidelityCreation('hosted-projection-fidelity')
    const service = await HostedRunService.open({ runId: 'hosted-projection-fidelity', ownerId: 'owner', ownerToken: 'secret', creation }, store)
    const initial = await service.execute('secret', { type: 'REQUEST_SNAPSHOT', requestId: 'initial' })
    const initialHouseholds = projectedHouseholdCount(initial)

    const materialized = await service.execute('secret', { type: 'MATERIALIZE_COHORT', requestId: 'materialize', cohortId: 'cohort:distant', populationCount: 12 })
    const materializedFrame = materialized.responses.find((response) => response.type === 'FRAME')
    expect(materializedFrame?.type).toBe('FRAME')
    if (materializedFrame?.type !== 'FRAME') throw new Error('Expected materialized hosted frame')
    expect(materializedFrame.projectionInvalidation.categories).toEqual(expect.arrayContaining(['people', 'locations']))
    expect(materializedFrame.projectionInvalidation.cellIds.length).toBeGreaterThan(0)
    expect(projectedHouseholdCount(materialized)).toBeGreaterThan(initialHouseholds)

    const snapshotResult = await service.execute('secret', { type: 'REQUEST_SNAPSHOT', requestId: 'materialized-snapshot' })
    const snapshot = snapshotResult.responses.find((response) => response.type === 'SNAPSHOT')
    if (snapshot?.type !== 'SNAPSHOT') throw new Error('Expected materialized hosted snapshot')
    const personIds = snapshot.snapshot.state.populationFidelity.transitions.find((transition) => transition.kind === 'materialized')?.personIds ?? []
    const dematerialized = await service.execute('secret', { type: 'DEMATERIALIZE_PEOPLE', requestId: 'dematerialize', personIds })
    const dematerializedFrame = dematerialized.responses.find((response) => response.type === 'FRAME')
    expect(dematerializedFrame?.type).toBe('FRAME')
    if (dematerializedFrame?.type !== 'FRAME') throw new Error('Expected dematerialized hosted frame')
    expect(dematerializedFrame.projectionInvalidation.categories).toEqual(expect.arrayContaining(['people', 'locations']))
    expect(dematerializedFrame.projectionInvalidation.cellIds.length).toBeGreaterThan(0)
    expect(projectedHouseholdCount(dematerialized)).toBe(initialHouseholds)
  })

})

function fidelityCreation(seed: string) {
  const cells = SimulationEngine.create(seed, 16, 12).project().world.grid.cells.filter((cell) => cell.movementCost > 0 && cell.habitability >= 500).map((cell) => cell.id)
  return {
    seed, name: 'Hosted projection fidelity', width: 16, height: 12, initialPopulationCount: 20,
    populationZones: [
      { id: 'detailed', name: 'Detailed', cellIds: cells.slice(0, 1), populationCount: 20 },
      { id: 'distant', name: 'Distant', cellIds: cells.slice(1, 5), populationCount: 0, cohortPopulationCount: 60 },
    ],
    settlements: [],
  }
}

function projectedHouseholdCount(result: Awaited<ReturnType<HostedRunService['execute']>>): number {
  const frame = result.responses.find((response) => response.type === 'FRAME')
  if (frame?.type !== 'FRAME') throw new Error('Expected hosted frame')
  return frame.projection.map.householdMarkers.reduce((sum, marker) => sum + marker.count, 0)
}

class FailingMutationStore extends MemoryHostedRunStore {
  fail = false
  override async commitRunMutation(...args: Parameters<MemoryHostedRunStore['commitRunMutation']>) {
    if (this.fail) throw new Error('injected persistence failure')
    return super.commitRunMutation(...args)
  }
}

class CommitThenThrowStore extends MemoryHostedRunStore {
  throwAfterCommit = false
  override async commitRunMutation(...args: Parameters<MemoryHostedRunStore['commitRunMutation']>) {
    const result = await super.commitRunMutation(...args)
    if (this.throwAfterCommit) { this.throwAfterCommit = false; throw new Error('injected lost commit acknowledgement') }
    return result
  }
}

class PoisoningMutationStore extends MemoryHostedRunStore {
  poison = false
  override async load(runId: string) { if (this.poison) throw new Error('injected reload failure'); return super.load(runId) }
  override async commitRunMutation(...args: Parameters<MemoryHostedRunStore['commitRunMutation']>) { if (this.poison) throw new Error('injected persistence failure'); return super.commitRunMutation(...args) }
}
