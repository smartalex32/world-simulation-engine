import { describe, expect, it } from 'vitest'
import { RandomProvider } from '../rng/pcg32'
import { generateValley } from '../spatial/worldGenerator'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { getPersonVariable } from '../variables/storage'
import { generatePopulation } from './population'

describe('population variable initialization', () => {
  it('preserves the legacy population draw order and isolates new variables in named streams', () => {
    const seed = 'population-variable-streams'
    const { world, random } = generateValley(seed)
    const legacyReplay = new RandomProvider(seed, random.snapshot()).stream('population')
    const homes = world.grid.cells.filter((cell) => cell.habitability >= 500 && cell.movementCost > 0)
    const expected = Array.from({ length: 4 }, () => ({
      homeCellId: homes[legacyReplay.nextInt(homes.length)]?.id,
      ignoredAgeYears: 18 + legacyReplay.nextInt(48),
      curiosity: legacyReplay.nextInt(1001),
      riskTolerance: legacyReplay.nextInt(1001),
      sociability: legacyReplay.nextInt(1001),
      hunger: legacyReplay.nextInt(301),
    }))

    const generated = generatePopulation(world.grid.cells, random)
    expect(generated.people.slice(0, 4).map((person) => ({
      homeCellId: person.homeCellId,
      curiosity: getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity),
      riskTolerance: getPersonVariable(person.variables, PERSON_VARIABLE_ID.riskTolerance),
      sociability: getPersonVariable(person.variables, PERSON_VARIABLE_ID.sociability),
      hunger: getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger),
    }))).toEqual(expected.map(({ ignoredAgeYears: _, ...entry }) => entry))

    expect(random.snapshot().map((stream) => stream.name)).toEqual(expect.arrayContaining([
      `population.variable.${PERSON_VARIABLE_ID.trustPropensity}`,
      `population.variable.${PERSON_VARIABLE_ID.conformity}`,
      `population.variable.${PERSON_VARIABLE_ID.persistence}`,
      `population.variable.${PERSON_VARIABLE_ID.fatigue}`,
      `population.variable.${PERSON_VARIABLE_ID.socialConnection}`,
      'population.households.childAge',
      'population.ageRemainderHours',
      'population.inheritance.person.trait.curiosity',
    ]))
  })

  it('creates the fixed family topology, inherited child curiosity, and canonical activity state', () => {
    const { world, random } = generateValley('population-households')
    const generated = generatePopulation(world.grid.cells, random)

    expect(generated.people).toHaveLength(200)
    expect(generated.households).toHaveLength(100)
    expect(generated.parentChildLinks).toHaveLength(100)
    expect(generated.households.filter(({ memberIds }) => memberIds.length === 3)).toHaveLength(50)
    expect(generated.households.filter(({ memberIds }) => memberIds.length === 1)).toHaveLength(50)
    const child = generated.people.find(({ id }) => id === 'person-0101')
    expect(child).toMatchObject({
      householdId: 'household-0001',
      activityScheduleId: 'activity.schedule.child.v1',
      currentActivity: { kind: 'home', locationId: 'activity.home.household-0001', sinceTick: 0 },
    })
    expect(child?.originTraces).toHaveLength(1)
    expect(getPersonVariable(child!.variables, PERSON_VARIABLE_ID.curiosity)).toBe(child?.originTraces[0]?.finalValue)
    expect(generated.parentChildLinks.slice(0, 2).map(({ id }) => id)).toEqual([
      'person-0001|person-0101',
      'person-0002|person-0102',
    ])
    expect(generated.activityLocations.map(({ id }) => id)).toEqual([...generated.activityLocations.map(({ id }) => id)].sort())
  })
})
