import { symmetricRoundDivision, assertPermille } from './math'
import { COMMUNITY_EMERGENT_IDS, type CommunityActionTarget, type CommunityEmergentValues, type CommunityFeedbackEdgeDefinition, type CommunityFeedbackEvaluation, type CommunityFeedbackRegistry } from './types'
import { compareStableText } from '../../shared/stableOrder'

export const COMMUNITY_FEEDBACK_DEFINITIONS: readonly CommunityFeedbackEdgeDefinition[] = Object.freeze([
  { id: 'community-social-trust-socialize-utility', sourceId: 'community.emergent.socialTrust', targetId: 'decision.socialize.utility', weightPermille: 240, enabled: true, order: 10 },
  { id: 'community-cohesion-socialize-utility', sourceId: 'community.emergent.cohesion', targetId: 'decision.socialize.utility', weightPermille: 160, enabled: true, order: 20 },
  { id: 'community-cooperation-socialize-utility', sourceId: 'community.emergent.cooperation', targetId: 'decision.socialize.utility', weightPermille: 140, enabled: true, order: 30 },
  { id: 'community-conflict-socialize-utility', sourceId: 'community.emergent.conflict', targetId: 'decision.socialize.utility', weightPermille: -160, enabled: true, order: 40 },
  { id: 'community-innovation-explore-utility', sourceId: 'community.emergent.innovationClimate', targetId: 'decision.explore.utility', weightPermille: 220, enabled: true, order: 50 },
])

export function createCommunityFeedbackRegistry(definitions: readonly CommunityFeedbackEdgeDefinition[] = COMMUNITY_FEEDBACK_DEFINITIONS): CommunityFeedbackRegistry {
  const ids = new Set<string>()
  const sorted = definitions.map((edge) => {
    if (ids.has(edge.id)) throw new Error(`Duplicate community feedback edge ID: ${edge.id}`)
    ids.add(edge.id)
    if (!(COMMUNITY_EMERGENT_IDS as readonly string[]).includes(edge.sourceId)) throw new Error(`Unknown community feedback source: ${edge.sourceId}`)
    if (edge.targetId !== 'decision.socialize.utility' && edge.targetId !== 'decision.explore.utility') throw new Error(`Unknown community feedback target: ${edge.targetId}`)
    if (!Number.isSafeInteger(edge.weightPermille) || !Number.isSafeInteger(edge.order)) throw new Error(`Community feedback edge ${edge.id} requires integer weight and order`)
    return Object.freeze({ ...edge })
  }).sort((a, b) => a.order - b.order || compareStableText(a.id, b.id))
  const byTarget = new Map<CommunityActionTarget, readonly CommunityFeedbackEdgeDefinition[]>()
  for (const edge of sorted) byTarget.set(edge.targetId, Object.freeze([...(byTarget.get(edge.targetId) ?? []), edge]))
  return Object.freeze({ definitions: Object.freeze(sorted), getByTarget: (targetId: CommunityActionTarget) => byTarget.get(targetId) ?? EMPTY })
}

const EMPTY: readonly CommunityFeedbackEdgeDefinition[] = Object.freeze([])
export const COMMUNITY_FEEDBACK_REGISTRY = createCommunityFeedbackRegistry()

/** Centered effects keep neutral 500-permille communities behaviorally neutral. */
export function evaluateCommunityFeedback(targetId: CommunityActionTarget, values: Readonly<CommunityEmergentValues>, registry: CommunityFeedbackRegistry = COMMUNITY_FEEDBACK_REGISTRY): CommunityFeedbackEvaluation {
  const contributions = registry.getByTarget(targetId).filter((edge) => edge.enabled).map((edge) => {
    const sourceValuePermille = values[edge.sourceId]
    assertPermille(sourceValuePermille, edge.sourceId)
    const centeredSourcePermille = sourceValuePermille - 500
    return Object.freeze({ edgeId: edge.id, sourceId: edge.sourceId, targetId, sourceValuePermille, centeredSourcePermille, weightPermille: edge.weightPermille, effect: symmetricRoundDivision(centeredSourcePermille * edge.weightPermille, 1000) })
  })
  return Object.freeze({ targetId, contributions: Object.freeze(contributions), totalEffect: contributions.reduce((total, contribution) => total + contribution.effect, 0) })
}
