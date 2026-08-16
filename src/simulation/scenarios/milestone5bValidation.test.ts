import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'
import { createSnapshot } from '../serialization/snapshot'

describe('Milestone 5B persistence and randomness contracts', () => {
  it('does not allocate a development-specific random stream across a full development window', async () => {
    const engine = SimulationEngine.create('milestone-5b-rng-contract')
    const initial = await engine.snapshot()
    const initialNames = initial.state.randomStreams.map(({ name }) => name)

    engine.step(720)
    const afterWindow = await engine.snapshot()
    const afterNames = afterWindow.state.randomStreams.map(({ name }) => name)

    expect(afterNames).toEqual(expect.arrayContaining(initialNames))
    expect(afterNames.some((name) => name.includes('development') || name.includes('exposure'))).toBe(false)
  }, 30_000)

  it('rejects a development change that references a different persisted experience', async () => {
    const snapshot = await SimulationEngine.create('milestone-5b-trace-integrity').snapshot()
    const state = structuredClone(snapshot.state)
    const child = state.people.find(({ id }) => id === 'person-0101')
    if (!child) throw new Error('Missing controlled child fixture')

    child.development.lastExperience = {
      id: 'person-0101:1-720:experience.parent.curiosity-modeling',
      type: 'experience.parent.curiosity-modeling',
      personId: child.id,
      householdId: child.householdId,
      sourcePersonIds: ['person-0001', 'person-0051'],
      activityLocationId: `activity.home.${child.householdId}`,
      startTick: 1,
      endTick: 720,
      recipientHours: 360,
      sourceHours: 720,
      sourceMeanPermille: 700,
      exposureStrengthPermille: 1000,
    }
    child.development.lastChange = {
      ...child.development.lastChange,
      edgeId: 'development.parent-curiosity-to-curiosity',
      targetId: 'person.trait.curiosity',
      experienceId: 'person-0101:721-1440:experience.parent.curiosity-modeling',
      previousValue: 400,
      sourceValuePermille: 700,
      gapPermille: 300,
      exposureStrengthPermille: 1000,
      ageBand: 'childhood',
      plasticityPermille: 30,
      resolution: 'deterministic',
      applicationProbabilityPermille: 1000,
      requestedDelta: 9,
      appliedDelta: 9,
      currentValue: 409,
    }

    await expect(SimulationEngine.restore(await createSnapshot(state))).rejects.toThrow(/experience|development change/i)
  })
})
