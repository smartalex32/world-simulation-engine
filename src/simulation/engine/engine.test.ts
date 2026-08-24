import { describe, expect, it } from 'vitest'
import { SimulationEngine } from './engine'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { getPersonVariable } from '../variables/storage'
import { createSnapshot } from '../serialization/snapshot'

describe('SimulationEngine', () => {
  it('generates an invariant seeded world and daily metrics', async () => {
    const first = SimulationEngine.create('regression-seed')
    const second = SimulationEngine.create('regression-seed')
    expect((await first.snapshot()).digest).toBe((await second.snapshot()).digest)
    const result = first.step(24)
    expect(result.projection.tick).toBe(24)
    expect(result.statistics.filter((sample) => sample.scope === 'world').map((sample) => sample.metricId)).toEqual([
      'world.cellCount',
      'world.habitableCells',
      'engine.simulatedDays',
      'population.count',
      'population.aliveCount',
      'population.averageHunger',
      'lifecycle.births',
      'lifecycle.deaths',
      'lifecycle.partnershipsFormed',
      'spatial.occupiedCells',
      'spatial.averageTravelCost',
      'resources.totalFood',
      'resources.foodRegenerated',
      'resources.foodConsumed',
      'resources.failedMeals',
      'economy.householdFood',
      'economy.productiveHours',
      'economy.foodProduced',
      'economy.agriculturalFoodProduced',
      'economy.foodShared',
      'economy.exchangeCount',
      'social.encounters',
      'social.encountersPer1000People',
      'social.relationshipCount',
      'social.networkDensityPermille',
      'social.averageFamiliarity',
      'social.positiveEncounters',
      'social.tenseEncounters',
      'activity.homePersonHours',
      'activity.commonsPersonHours',
      'activity.travelPersonHours',
      'household.parentChildCoExposureSourceHours',
      'development.experiences',
      'development.curiosityChanges',
      'development.absoluteCuriosityChange',
      'development.broaderExperiences',
      'development.broaderChanges',
    ])
    expect(result.statistics.filter((sample) => sample.scope === 'community')).toHaveLength(16)
    expect(new Set(result.statistics.filter((sample) => sample.scope === 'community').map((sample) => sample.scopeId))).toEqual(new Set(['community-west-valley', 'community-east-valley']))
    expect(result.statistics[2]?.value).toBe(1)
    expect(result.projection.people).toHaveLength(200)
    expect(result.projection.households).toHaveLength(100)
    expect(result.projection.parentChildLinks).toHaveLength(100)
    expect(result.projection.relationships.length).toBeGreaterThan(0)
    expect(result.events.some((event) => event.type === 'PERSON_ENCOUNTERED')).toBe(true)
    expect(result.statistics.find((sample) => sample.metricId === 'social.encounters')?.value).toBeGreaterThan(0)
    expect(result.projection.people.every((person) => {
      const hunger = getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger)
      return person.lastDecision && hunger >= 0 && hunger <= 1000 && person.knowledge && Object.values(person.knowledge).every((value) => value >= 0 && value <= 1000)
    })).toBe(true)
    expect(result.projection.world.grid.cells.every((cell) => cell.foodAmount >= 0 && cell.foodAmount <= cell.resourceCapacity)).toBe(true)
  })

  it('produces different worlds for different seeds', async () => {
    expect((await SimulationEngine.create('alpha').snapshot()).digest).not.toBe((await SimulationEngine.create('beta').snapshot()).digest)
  })

  it('records terminal age mortality while retaining the person for historical integrity', async () => {
    const source = SimulationEngine.create('life-cycle-terminal-mortality')
    const snapshot = await source.snapshot()
    const linkedIds = new Set(snapshot.state.parentChildLinks.flatMap((link) => [link.parentId, link.childId]))
    const person = snapshot.state.people.find((candidate) => !linkedIds.has(candidate.id))
    if (!person) throw new Error('Expected an unlinked adult fixture')
    person.ageYears = 119
    person.ageHoursIntoYear = 8759
    person.lifeStage = 'olderAdult'
    const engine = await SimulationEngine.restore(await createSnapshot(snapshot.state))
    const result = engine.step()
    expect(result.events.find((event) => event.type === 'PERSON_DIED')?.payload.personId).toBe(person.id)
    expect(result.projection.people.find((candidate) => candidate.id === person.id)?.lifeStatus).toBe('dead')
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
  }, 15_000)

  it('rejects modified snapshots', async () => {
    const snapshot = await SimulationEngine.create('integrity').snapshot()
    snapshot.state.runId = `${snapshot.state.runId}-tampered`
    await expect(SimulationEngine.restore(snapshot)).rejects.toThrow('digest')
  })

  it('rejects schema 7 snapshots instead of silently migrating them', async () => {
    const snapshot = await SimulationEngine.create('old-schema').snapshot()
    snapshot.schemaVersion = 7
    await expect(SimulationEngine.restore(snapshot)).rejects.toThrow('Unsupported snapshot schema: 7')
  })
})
