import { describe, expect, it } from 'vitest'
import type { GeographicCell, PersonState } from '../domain/types'
import { Pcg32, hashSeed } from '../rng/pcg32'
import { advanceJourney, chooseAction, evaluateActions, resolveAction, type ActionContext } from './actions'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { createDefaultPersonVariableValues, getPersonVariable, setPersonVariable } from '../variables/storage'

function createCells(): GeographicCell[] {
  return [
    { id: '1,1', q: 1, r: 1, terrain: 'plain', elevation: 200, habitability: 800, movementCost: 1000, resourceCapacity: 100, foodAmount: 100, foodRegenerationPerDay: 8 },
    { id: '2,1', q: 2, r: 1, terrain: 'plain', elevation: 220, habitability: 800, movementCost: 1000, resourceCapacity: 150, foodAmount: 150, foodRegenerationPerDay: 12 },
    { id: '1,2', q: 1, r: 2, terrain: 'hill', elevation: 620, habitability: 300, movementCost: 1800, resourceCapacity: 20, foodAmount: 20, foodRegenerationPerDay: 1 },
  ]
}

function createContext(cells: GeographicCell[], occupants = ['test-person']): ActionContext {
  return {
    tick: 12,
    cellById: new Map(cells.map((cell) => [cell.id, cell])),
    occupantsByCell: new Map([['1,1', occupants]]),
    occupantsByActivityLocation: new Map([['activity.home.household-test', occupants]]),
  }
}

function person(curiosity = 500): PersonState {
  return {
    id: 'test-person',
    ageYears: 30,
    ageHoursIntoYear: 0,
    locationCellId: '1,1',
    homeCellId: '1,1',
    householdId: 'household-test',
    activityScheduleId: 'activity.schedule.adult.v1',
    currentActivity: { kind: 'home', locationId: 'activity.home.household-test', sinceTick: 0 },
    originTraces: [],
    variables: createDefaultPersonVariableValues({
      [PERSON_VARIABLE_ID.curiosity]: curiosity,
      [PERSON_VARIABLE_ID.riskTolerance]: 500,
      [PERSON_VARIABLE_ID.sociability]: 500,
      [PERSON_VARIABLE_ID.hunger]: 100,
    }),
    knownCellIds: ['1,1'],
  }
}

describe('agent actions', () => {
  it('provides named, inspectable utility contributions', () => {
    const cells = createCells()
    const candidates = evaluateActions(person(900), createContext(cells))
    const explore = candidates.find((candidate) => candidate.action === 'explore')
    expect(explore?.contributions).toContainEqual(expect.objectContaining({
      kind: 'influence',
      factor: 'curiosity',
      sourceId: PERSON_VARIABLE_ID.curiosity,
      sourceValue: 900,
      weightPermille: 800,
      value: 720,
    }))
    expect(explore?.weight).toBeGreaterThan(candidates.find((candidate) => candidate.action === 'rest')?.weight ?? 0)
  })

  it('applies eating and exploration without violating state bounds', () => {
    const cells = createCells()
    const context = createContext(cells)
    const agent = person()
    setPersonVariable(agent.variables, PERSON_VARIABLE_ID.hunger, 700)
    const beforeFood = cells[0]?.foodAmount ?? 0
    resolveAction(agent, { tick: 1, action: 'eat', weight: 1, totalWeight: 1, probabilityPermille: 1000, contributions: [], alternatives: [] }, context)
    expect(getPersonVariable(agent.variables, PERSON_VARIABLE_ID.hunger)).toBeGreaterThanOrEqual(0)
    expect(getPersonVariable(agent.variables, PERSON_VARIABLE_ID.hunger)).toBeLessThan(700)
    expect(cells[0]?.foodAmount).toBeLessThan(beforeFood)
    resolveAction(agent, { tick: 2, action: 'explore', targetCellId: '2,1', weight: 1, totalWeight: 1, probabilityPermille: 1000, contributions: [], alternatives: [] }, context)
    expect(agent.locationCellId).toBe('2,1')
    expect(agent.knownCellIds).toContain('2,1')
  })

  it('takes more than one hourly budget to cross costly terrain', () => {
    const cells = createCells()
    const context = createContext(cells)
    const agent = person()
    const outcome = resolveAction(agent, { tick: 1, action: 'explore', targetCellId: '1,2', weight: 1, totalWeight: 1, probabilityPermille: 1000, contributions: [], alternatives: [] }, context)
    expect(outcome.arrived).toBe(false)
    expect(agent.locationCellId).toBe('1,1')
    expect(agent.journey?.remainingCost).toBe(800)
    expect(advanceJourney(agent, 1000)?.arrived).toBe(true)
    expect(agent.locationCellId).toBe('1,2')
  })

  it('resolves scarce food contention without allowing negative stock', () => {
    const cells = createCells()
    const context = createContext(cells)
    const scarceCell = cells[0]
    if (!scarceCell) throw new Error('Missing test cell')
    scarceCell.foodAmount = 10
    const first = person()
    const secondBase = person()
    const second = { ...secondBase, id: 'second-person', variables: { ...secondBase.variables }, knownCellIds: [...secondBase.knownCellIds] }
    setPersonVariable(first.variables, PERSON_VARIABLE_ID.hunger, 500)
    setPersonVariable(second.variables, PERSON_VARIABLE_ID.hunger, 500)
    const eat = { tick: 1, action: 'eat' as const, weight: 1, totalWeight: 1, probabilityPermille: 1000, contributions: [], alternatives: [] }
    const firstOutcome = resolveAction(first, eat, context)
    const secondOutcome = resolveAction(second, eat, context)
    expect(firstOutcome.foodConsumed).toBe(10)
    expect(secondOutcome.failedMeal).toBe(true)
    expect(scarceCell.foodAmount).toBe(0)
  })

  it('makes high-curiosity agents explore more often across many seeds', () => {
    const cells = createCells()
    const context = createContext(cells)
    let lowExploration = 0
    let highExploration = 0
    for (let seed = 0; seed < 500; seed += 1) {
      if (chooseAction(person(0), context, new Pcg32(hashSeed(`trial-${seed}`))).action === 'explore') lowExploration += 1
      if (chooseAction(person(1000), context, new Pcg32(hashSeed(`trial-${seed}`))).action === 'explore') highExploration += 1
    }
    expect(highExploration).toBeGreaterThan(lowExploration * 1.7)
  })

  it('does not offer socialize without another occupant', () => {
    const cells = createCells()
    const candidates = evaluateActions(person(), createContext(cells))

    expect(candidates.find((candidate) => candidate.action === 'socialize')).toBeUndefined()
  })

  it('offers socialize with named contributions when another occupant shares the activity location', () => {
    const cells = createCells()
    const candidates = evaluateActions(person(), createContext(cells, ['test-person', 'other-person']))
    const socialize = candidates.find((candidate) => candidate.action === 'socialize')

    expect(socialize).toBeDefined()
    expect(socialize?.contributions.map(({ factor, value }) => ({ factor, value }))).toEqual([
      { factor: 'base', value: 20 },
      { factor: 'sociability', value: 375 },
      { factor: 'hunger', value: -15 },
      { factor: 'social need', value: 0 },
      { factor: 'people present', value: 90 },
    ])
    expect(socialize?.weight).toBe(470)
  })
})
