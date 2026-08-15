import { describe, expect, it } from 'vitest'
import type { GeographicCell, PersonState } from '../domain/types'
import { Pcg32, hashSeed } from '../rng/pcg32'
import { applyAction, chooseAction, evaluateActions, type ActionContext } from './actions'

const cells: GeographicCell[] = [
  { id: '1,1', q: 1, r: 1, terrain: 'plain', elevation: 200, habitability: 800, movementCost: 1000, resourceCapacity: 100 },
  { id: '2,1', q: 2, r: 1, terrain: 'plain', elevation: 220, habitability: 800, movementCost: 1000, resourceCapacity: 150 },
  { id: '1,2', q: 1, r: 2, terrain: 'hill', elevation: 620, habitability: 300, movementCost: 1800, resourceCapacity: 20 },
]

const context: ActionContext = {
  tick: 12,
  cellById: new Map(cells.map((cell) => [cell.id, cell])),
  occupantsByCell: new Map([['1,1', ['test-person']]]),
}

function person(curiosity = 500): PersonState {
  return {
    id: 'test-person',
    ageYears: 30,
    locationCellId: '1,1',
    homeCellId: '1,1',
    traits: { curiosity, riskTolerance: 500, sociability: 500 },
    hunger: 100,
    knownCellIds: ['1,1'],
  }
}

describe('agent actions', () => {
  it('provides named, inspectable utility contributions', () => {
    const candidates = evaluateActions(person(900), context)
    const explore = candidates.find((candidate) => candidate.action === 'explore')
    expect(explore?.contributions).toContainEqual({ factor: 'curiosity', value: 720 })
    expect(explore?.weight).toBeGreaterThan(candidates.find((candidate) => candidate.action === 'rest')?.weight ?? 0)
  })

  it('applies eating and exploration without violating state bounds', () => {
    const agent = person()
    agent.hunger = 700
    applyAction(agent, { tick: 1, action: 'eat', weight: 1, totalWeight: 1, probabilityPermille: 1000, contributions: [], alternatives: [] }, context)
    expect(agent.hunger).toBeGreaterThanOrEqual(0)
    expect(agent.hunger).toBeLessThan(700)
    applyAction(agent, { tick: 2, action: 'explore', targetCellId: '2,1', weight: 1, totalWeight: 1, probabilityPermille: 1000, contributions: [], alternatives: [] }, context)
    expect(agent.locationCellId).toBe('2,1')
    expect(agent.knownCellIds).toContain('2,1')
  })

  it('makes high-curiosity agents explore more often across many seeds', () => {
    let lowExploration = 0
    let highExploration = 0
    for (let seed = 0; seed < 500; seed += 1) {
      if (chooseAction(person(0), context, new Pcg32(hashSeed(`trial-${seed}`))).action === 'explore') lowExploration += 1
      if (chooseAction(person(1000), context, new Pcg32(hashSeed(`trial-${seed}`))).action === 'explore') highExploration += 1
    }
    expect(highExploration).toBeGreaterThan(lowExploration * 1.7)
  })
})
