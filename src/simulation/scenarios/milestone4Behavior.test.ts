import { describe, expect, it } from 'vitest'
import type { GeographicCell, PersonState } from '../domain/types'
import { chooseAction, evaluateActions, resolveAction, type ActionContext } from '../agents/actions'
import { evaluateInfluences } from '../influences/evaluate'
import { INFLUENCE_DEFINITIONS } from '../influences/registry'
import { Pcg32, hashSeed } from '../rng/pcg32'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { createDefaultPersonVariableValues, getPersonVariable } from '../variables/storage'
import type { PersonVariableId, PersonVariableValues } from '../variables/types'

const homeCell: GeographicCell = {
  id: '0,0',
  q: 0,
  r: 0,
  terrain: 'plain',
  elevation: 200,
  habitability: 800,
  movementCost: 1000,
  resourceCapacity: 100,
  foodAmount: 100,
  foodRegenerationPerDay: 8,
}

const unknownNeighbor: GeographicCell = {
  id: '1,0',
  q: 1,
  r: 0,
  terrain: 'plain',
  elevation: 220,
  habitability: 800,
  movementCost: 1000,
  resourceCapacity: 100,
  foodAmount: 100,
  foodRegenerationPerDay: 8,
}

function person(overrides: Partial<PersonVariableValues> = {}): PersonState {
  return {
    id: 'person-a',
    ageYears: 30,
    locationCellId: homeCell.id,
    homeCellId: homeCell.id,
    variables: createDefaultPersonVariableValues(overrides),
    knownCellIds: [homeCell.id],
  }
}

function context(withCompany = false): ActionContext {
  return {
    tick: 12,
    cellById: new Map([[homeCell.id, { ...homeCell }], [unknownNeighbor.id, { ...unknownNeighbor }]]),
    occupantsByCell: new Map([[homeCell.id, withCompany ? ['person-a', 'person-b'] : ['person-a']]]),
  }
}

function selectionCount(variableId: PersonVariableId, value: number, action: string, withCompany = false): number {
  let count = 0
  for (let seed = 0; seed < 1000; seed += 1) {
    const selected = chooseAction(
      person({ [variableId]: value }),
      context(withCompany),
      new Pcg32(hashSeed(`milestone-4-tendency-${seed}`)),
    )
    if (selected.action === action) count += 1
  }
  return count
}

describe('Milestone 4 influence behavior', () => {
  it('applies every enabled edge with its exact signed linear tendency', () => {
    for (const edge of INFLUENCE_DEFINITIONS.filter(({ enabled }) => enabled)) {
      const low = evaluateInfluences(
        edge.targetId,
        createDefaultPersonVariableValues({ [edge.sourceId]: 0 }),
      ).contributions.find(({ edgeId }) => edgeId === edge.id)
      const high = evaluateInfluences(
        edge.targetId,
        createDefaultPersonVariableValues({ [edge.sourceId]: 1000 }),
      ).contributions.find(({ edgeId }) => edgeId === edge.id)

      expect(low?.sourceValue, edge.id).toBe(0)
      expect(low?.effect === 0, edge.id).toBe(true)
      expect(high, edge.id).toMatchObject({ sourceValue: 1000, effect: edge.weightPermille })
      expect((high?.effect ?? 0) - (low?.effect ?? 0), edge.id).toBe(edge.weightPermille)
    }
  })

  it('stores trust, conformity, and persistence without adding utility edges', () => {
    const deferredVariables = [
      PERSON_VARIABLE_ID.trustPropensity,
      PERSON_VARIABLE_ID.conformity,
      PERSON_VARIABLE_ID.persistence,
    ] as const
    const stored = person({
      [PERSON_VARIABLE_ID.trustPropensity]: 123,
      [PERSON_VARIABLE_ID.conformity]: 456,
      [PERSON_VARIABLE_ID.persistence]: 789,
    })

    expect(deferredVariables.map((id) => getPersonVariable(stored.variables, id))).toEqual([123, 456, 789])
    expect(INFLUENCE_DEFINITIONS.some(({ sourceId }) => deferredVariables.includes(sourceId as typeof deferredVariables[number]))).toBe(false)

    for (const id of deferredVariables) {
      const low = evaluateActions(person({ [id]: 0 }), context(true))
      const high = evaluateActions(person({ [id]: 1000 }), context(true))
      expect(high, id).toEqual(low)
      expect(high.flatMap(({ contributions }) => contributions).some(({ sourceId }) => sourceId === id), id).toBe(false)
    }
  })

  it('never selects actions that are unavailable in the current context', () => {
    const isolatedCell = { ...homeCell, foodAmount: 0 }
    const isolatedContext: ActionContext = {
      tick: 12,
      cellById: new Map([[isolatedCell.id, isolatedCell]]),
      occupantsByCell: new Map([[isolatedCell.id, ['person-a']]]),
    }
    const isolatedPerson = person()

    expect(evaluateActions(isolatedPerson, isolatedContext).map(({ action }) => action)).toEqual(['rest'])
    for (let seed = 0; seed < 250; seed += 1) {
      expect(chooseAction(isolatedPerson, isolatedContext, new Pcg32(hashSeed(`unavailable-${seed}`))).action).toBe('rest')
    }
  })

  it('reduces fatigue by 180 on rest and clamps the state at zero', () => {
    const rested = person({ [PERSON_VARIABLE_ID.fatigue]: 500 })
    const restedOutcome = resolveAction(rested, {
      tick: 12,
      action: 'rest',
      weight: 1,
      totalWeight: 1,
      probabilityPermille: 1000,
      contributions: [],
      alternatives: [],
    }, context())
    expect(getPersonVariable(rested.variables, PERSON_VARIABLE_ID.fatigue)).toBe(320)
    expect(restedOutcome.fatigueReduced).toBe(180)

    const clamped = person({ [PERSON_VARIABLE_ID.fatigue]: 100 })
    const clampedOutcome = resolveAction(clamped, {
      tick: 12,
      action: 'rest',
      weight: 1,
      totalWeight: 1,
      probabilityPermille: 1000,
      contributions: [],
      alternatives: [],
    }, context())
    expect(getPersonVariable(clamped.variables, PERSON_VARIABLE_ID.fatigue)).toBe(0)
    expect(clampedOutcome.fatigueReduced).toBe(100)
  })

  it('selects explore materially more often when curiosity is higher across repeated seeds', () => {
    const low = selectionCount(PERSON_VARIABLE_ID.curiosity, 0, 'explore')
    const high = selectionCount(PERSON_VARIABLE_ID.curiosity, 1000, 'explore')
    expect(high).toBeGreaterThan(low + 200)
  })

  it('selects rest materially more often when fatigue is higher across repeated seeds', () => {
    const low = selectionCount(PERSON_VARIABLE_ID.fatigue, 0, 'rest')
    const high = selectionCount(PERSON_VARIABLE_ID.fatigue, 1000, 'rest')
    expect(high).toBeGreaterThan(low + 200)
  })

  it('selects socialize materially more often when social need is higher across repeated seeds', () => {
    const low = selectionCount(PERSON_VARIABLE_ID.socialConnection, 0, 'socialize', true)
    const high = selectionCount(PERSON_VARIABLE_ID.socialConnection, 1000, 'socialize', true)
    expect(high).toBeGreaterThan(low + 100)
  })
})
