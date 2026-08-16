import type { PersonVariableValues } from '../variables/types'
import { INFLUENCE_REGISTRY } from './registry'
import type {
  DecisionInfluenceTarget,
  InfluenceContribution,
  InfluenceEvaluation,
  InfluenceRegistry,
} from './types'

function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

export function evaluateInfluences(
  targetId: DecisionInfluenceTarget,
  values: Readonly<PersonVariableValues>,
  registry: InfluenceRegistry = INFLUENCE_REGISTRY,
): InfluenceEvaluation {
  const contributions: InfluenceContribution[] = []
  let totalEffect = 0

  for (const edge of registry.getByTarget(targetId)) {
    if (!edge.enabled) continue
    const sourceValue = values[edge.sourceId]
    const effect = roundHalfAwayFromZero((sourceValue * edge.weightPermille) / 1000)
    contributions.push(Object.freeze({
      kind: 'influence',
      edgeId: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      sourceValue,
      weightPermille: edge.weightPermille,
      effect,
    }))
    totalEffect += effect
  }

  return Object.freeze({
    targetId,
    contributions: Object.freeze(contributions),
    totalEffect,
  })
}
