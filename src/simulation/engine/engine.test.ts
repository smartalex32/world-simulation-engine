import { describe, expect, it } from 'vitest'
import { SimulationEngine } from './engine'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { getPersonVariable } from '../variables/storage'

describe('SimulationEngine', () => {
  it('generates an invariant seeded world and daily metrics', async () => {
    const first = SimulationEngine.create('regression-seed')
    const second = SimulationEngine.create('regression-seed')
    expect((await first.snapshot()).digest).toBe((await second.snapshot()).digest)
    const result = first.step(24)
    expect(result.projection.tick).toBe(24)
    expect(result.statistics.map((sample) => sample.metricId)).toEqual([
      'world.cellCount',
      'world.habitableCells',
      'engine.simulatedDays',
      'population.count',
      'population.averageHunger',
      'spatial.occupiedCells',
      'spatial.averageTravelCost',
      'resources.totalFood',
      'resources.foodConsumed',
      'resources.failedMeals',
      'social.encounters',
      'social.encountersPer1000People',
      'social.relationshipCount',
      'social.networkDensityPermille',
      'social.averageFamiliarity',
      'social.positiveEncounters',
      'social.tenseEncounters',
    ])
    expect(result.statistics[2]?.value).toBe(1)
    expect(result.projection.people).toHaveLength(200)
    expect(result.projection.relationships.length).toBeGreaterThan(0)
    expect(result.events.some((event) => event.type === 'PERSON_ENCOUNTERED')).toBe(true)
    expect(result.statistics.find((sample) => sample.metricId === 'social.encounters')?.value).toBeGreaterThan(0)
    expect(result.projection.people.every((person) => {
      const hunger = getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger)
      return person.lastDecision && hunger >= 0 && hunger <= 1000
    })).toBe(true)
    expect(result.projection.world.grid.cells.every((cell) => cell.foodAmount >= 0 && cell.foodAmount <= cell.resourceCapacity)).toBe(true)
  })

  it('produces different worlds for different seeds', async () => {
    expect((await SimulationEngine.create('alpha').snapshot()).digest).not.toBe((await SimulationEngine.create('beta').snapshot()).digest)
  })

  it('resumes to the same state as an uninterrupted command sequence', async () => {
    const uninterrupted = SimulationEngine.create('resume-seed')
    uninterrupted.step(120)
    uninterrupted.step(120)

    const interrupted = SimulationEngine.create('resume-seed')
    interrupted.step(120)
    const restored = await SimulationEngine.restore(await interrupted.snapshot())
    restored.step(120)

    expect((await restored.snapshot()).digest).toBe((await uninterrupted.snapshot()).digest)
  })

  it('rejects modified snapshots', async () => {
    const snapshot = await SimulationEngine.create('integrity').snapshot()
    snapshot.state.tick = 5
    await expect(SimulationEngine.restore(snapshot)).rejects.toThrow('digest')
  })

  it('rejects schema 4 snapshots instead of silently migrating them', async () => {
    const snapshot = await SimulationEngine.create('old-schema').snapshot()
    snapshot.schemaVersion = 4
    await expect(SimulationEngine.restore(snapshot)).rejects.toThrow('Unsupported snapshot schema: 4')
  })
})
