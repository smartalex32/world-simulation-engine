import { describe, expect, it } from 'vitest'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import {
  createInfluenceRegistry,
  DECISION_INFLUENCE_TARGET,
  INFLUENCE_DEFINITIONS,
  INFLUENCE_REGISTRY,
} from './registry'
import type { InfluenceEdgeDefinition } from './types'

const edge = (
  overrides: Partial<InfluenceEdgeDefinition> = {},
): InfluenceEdgeDefinition => ({
  id: 'test-edge',
  sourceId: PERSON_VARIABLE_ID.curiosity,
  targetId: DECISION_INFLUENCE_TARGET.exploreUtility,
  weightPermille: 100,
  curve: 'linear',
  timeHorizon: 'immediate',
  enabled: true,
  order: 10,
  ...overrides,
})

describe('influence registry', () => {
  it('contains the frozen eleven-edge initial registry', () => {
    expect(INFLUENCE_DEFINITIONS).toHaveLength(11)
    expect(INFLUENCE_REGISTRY.definitions.map((definition) => [definition.sourceId, definition.targetId, definition.weightPermille])).toEqual([
      [PERSON_VARIABLE_ID.hunger, DECISION_INFLUENCE_TARGET.eatUtility, 900],
      [PERSON_VARIABLE_ID.hunger, DECISION_INFLUENCE_TARGET.moveUtility, 120],
      [PERSON_VARIABLE_ID.sociability, DECISION_INFLUENCE_TARGET.moveUtility, 80],
      [PERSON_VARIABLE_ID.curiosity, DECISION_INFLUENCE_TARGET.exploreUtility, 800],
      [PERSON_VARIABLE_ID.riskTolerance, DECISION_INFLUENCE_TARGET.exploreUtility, 250],
      [PERSON_VARIABLE_ID.hunger, DECISION_INFLUENCE_TARGET.exploreUtility, -350],
      [PERSON_VARIABLE_ID.hunger, DECISION_INFLUENCE_TARGET.restUtility, -200],
      [PERSON_VARIABLE_ID.sociability, DECISION_INFLUENCE_TARGET.socializeUtility, 750],
      [PERSON_VARIABLE_ID.hunger, DECISION_INFLUENCE_TARGET.socializeUtility, -150],
      [PERSON_VARIABLE_ID.fatigue, DECISION_INFLUENCE_TARGET.restUtility, 800],
      [PERSON_VARIABLE_ID.socialConnection, DECISION_INFLUENCE_TARGET.socializeUtility, 650],
    ])
  })

  it('pre-indexes edges by target in stable order', () => {
    const registry = createInfluenceRegistry([
      edge({ id: 'later', order: 20 }),
      edge({ id: 'alpha', order: 10 }),
      edge({ id: 'beta', order: 10 }),
      edge({ id: 'eat', targetId: DECISION_INFLUENCE_TARGET.eatUtility, order: 5 }),
    ])

    expect(registry.definitions.map(({ id }) => id)).toEqual(['eat', 'alpha', 'beta', 'later'])
    expect(registry.getByTarget(DECISION_INFLUENCE_TARGET.exploreUtility).map(({ id }) => id)).toEqual(['alpha', 'beta', 'later'])
    expect(registry.getByTarget(DECISION_INFLUENCE_TARGET.moveUtility)).toEqual([])
  })

  it('rejects duplicate edge IDs', () => {
    expect(() => createInfluenceRegistry([edge(), edge()])).toThrow('Duplicate influence edge ID: test-edge')
  })

  it('rejects source IDs missing from the person variable registry', () => {
    expect(() => createInfluenceRegistry([
      edge({ sourceId: 'person.trait.unknown' as InfluenceEdgeDefinition['sourceId'] }),
    ])).toThrow('Unknown influence source variable: person.trait.unknown')
  })

  it('rejects targets missing from the decision target registry', () => {
    expect(() => createInfluenceRegistry([
      edge({ targetId: 'decision.unknown.utility' as InfluenceEdgeDefinition['targetId'] }),
    ])).toThrow('Unknown influence target: decision.unknown.utility')
  })
})
