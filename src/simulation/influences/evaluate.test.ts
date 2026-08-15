import { describe, expect, it } from 'vitest'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { createDefaultPersonVariableValues } from '../variables/storage'
import { evaluateInfluences } from './evaluate'
import { createInfluenceRegistry, DECISION_INFLUENCE_TARGET } from './registry'

describe('influence evaluation', () => {
  it('uses exact integer permille math and preserves contribution order', () => {
    const values = createDefaultPersonVariableValues({
      [PERSON_VARIABLE_ID.curiosity]: 625,
      [PERSON_VARIABLE_ID.riskTolerance]: 400,
      [PERSON_VARIABLE_ID.hunger]: 200,
    })

    expect(evaluateInfluences(DECISION_INFLUENCE_TARGET.exploreUtility, values)).toEqual({
      targetId: DECISION_INFLUENCE_TARGET.exploreUtility,
      contributions: [
        {
          kind: 'influence',
          edgeId: 'curiosity-explore-utility',
          sourceId: PERSON_VARIABLE_ID.curiosity,
          targetId: DECISION_INFLUENCE_TARGET.exploreUtility,
          sourceValue: 625,
          weightPermille: 800,
          effect: 500,
        },
        {
          kind: 'influence',
          edgeId: 'risk-tolerance-explore-utility',
          sourceId: PERSON_VARIABLE_ID.riskTolerance,
          targetId: DECISION_INFLUENCE_TARGET.exploreUtility,
          sourceValue: 400,
          weightPermille: 250,
          effect: 100,
        },
        {
          kind: 'influence',
          edgeId: 'hunger-explore-utility',
          sourceId: PERSON_VARIABLE_ID.hunger,
          targetId: DECISION_INFLUENCE_TARGET.exploreUtility,
          sourceValue: 200,
          weightPermille: -350,
          effect: -70,
        },
      ],
      totalEffect: 530,
    })
  })

  it('rounds negative and positive half values symmetrically away from zero', () => {
    const values = createDefaultPersonVariableValues({
      [PERSON_VARIABLE_ID.hunger]: 5,
    })
    const registry = createInfluenceRegistry([
      {
        id: 'negative-half',
        sourceId: PERSON_VARIABLE_ID.hunger,
        targetId: DECISION_INFLUENCE_TARGET.restUtility,
        weightPermille: -100,
        curve: 'linear',
        timeHorizon: 'immediate',
        enabled: true,
        order: 10,
      },
      {
        id: 'positive-half',
        sourceId: PERSON_VARIABLE_ID.hunger,
        targetId: DECISION_INFLUENCE_TARGET.restUtility,
        weightPermille: 100,
        curve: 'linear',
        timeHorizon: 'immediate',
        enabled: true,
        order: 20,
      },
    ])

    expect(evaluateInfluences(DECISION_INFLUENCE_TARGET.restUtility, values, registry).contributions.map(({ effect }) => effect)).toEqual([-1, 1])
  })

  it('returns only the sparse edges for the requested target', () => {
    const evaluation = evaluateInfluences(
      DECISION_INFLUENCE_TARGET.eatUtility,
      createDefaultPersonVariableValues({ [PERSON_VARIABLE_ID.hunger]: 333 }),
    )

    expect(evaluation.contributions).toHaveLength(1)
    expect(evaluation.contributions[0]?.effect).toBe(300)
    expect(evaluation.totalEffect).toBe(300)
  })
})
