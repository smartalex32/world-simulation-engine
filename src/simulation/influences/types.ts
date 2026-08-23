import type { PersonVariableId } from '../variables/types'

export const DECISION_INFLUENCE_TARGETS = Object.freeze([
  'decision.eat.utility',
  'decision.move.utility',
  'decision.explore.utility',
  'decision.rest.utility',
  'decision.socialize.utility',
  'decision.work.utility',
] as const)

export type DecisionInfluenceTarget = typeof DECISION_INFLUENCE_TARGETS[number]

export interface InfluenceEdgeDefinition {
  id: string
  sourceId: PersonVariableId
  targetId: DecisionInfluenceTarget
  weightPermille: number
  curve: 'linear'
  timeHorizon: 'immediate'
  enabled: boolean
  order: number
}

export interface InfluenceContribution {
  kind: 'influence'
  edgeId: string
  sourceId: PersonVariableId
  targetId: DecisionInfluenceTarget
  sourceValue: number
  weightPermille: number
  effect: number
}

export interface InfluenceEvaluation {
  targetId: DecisionInfluenceTarget
  contributions: readonly InfluenceContribution[]
  totalEffect: number
}

export interface InfluenceRegistry {
  readonly definitions: readonly InfluenceEdgeDefinition[]
  getByTarget(targetId: DecisionInfluenceTarget): readonly InfluenceEdgeDefinition[]
}
