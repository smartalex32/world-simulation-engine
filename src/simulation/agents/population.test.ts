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
      ageYears: 18 + legacyReplay.nextInt(48),
      curiosity: legacyReplay.nextInt(1001),
      riskTolerance: legacyReplay.nextInt(1001),
      sociability: legacyReplay.nextInt(1001),
      hunger: legacyReplay.nextInt(301),
    }))

    const people = generatePopulation(world.grid.cells, random, 4)
    expect(people.map((person) => ({
      homeCellId: person.homeCellId,
      ageYears: person.ageYears,
      curiosity: getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity),
      riskTolerance: getPersonVariable(person.variables, PERSON_VARIABLE_ID.riskTolerance),
      sociability: getPersonVariable(person.variables, PERSON_VARIABLE_ID.sociability),
      hunger: getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger),
    }))).toEqual(expected)

    expect(random.snapshot().map((stream) => stream.name)).toEqual(expect.arrayContaining([
      `population.variable.${PERSON_VARIABLE_ID.trustPropensity}`,
      `population.variable.${PERSON_VARIABLE_ID.conformity}`,
      `population.variable.${PERSON_VARIABLE_ID.persistence}`,
      `population.variable.${PERSON_VARIABLE_ID.fatigue}`,
      `population.variable.${PERSON_VARIABLE_ID.socialConnection}`,
    ]))
  })
})
