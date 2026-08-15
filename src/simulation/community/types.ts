import type { GeographicCell } from '../domain/types'

export const COMMUNITY_EMERGENT_IDS = Object.freeze([
  'community.emergent.socialTrust',
  'community.emergent.cohesion',
  'community.emergent.cooperation',
  'community.emergent.conflict',
  'community.emergent.innovationClimate',
] as const)

export type CommunityEmergentId = typeof COMMUNITY_EMERGENT_IDS[number]
export const COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID = 'community.structural.foodSecurity' as const
export type CommunityStructuralId = typeof COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID
export type CommunityVariableId = CommunityEmergentId | CommunityStructuralId
export type CommunityActionTarget = 'decision.socialize.utility' | 'decision.explore.utility'

export interface CommunityCatchment {
  readonly id: string
  readonly displayName: string
  readonly anchorCellId: string
  readonly cellIds: readonly string[]
}

/** Per catchment, daily evidence produced by the engine. Counts are non-negative integer units. */
export interface DailyCommunityCounters {
  readonly windowStartTick: number
  readonly windowEndTick: number
  /** Canonical unique people who had physical exposure in this catchment. */
  readonly exposedPersonIds: readonly string[]
  /** Canonical unique people participating in resolved encounters here. */
  readonly encounterParticipantIds: readonly string[]
  /** Canonical unique relationship IDs touched by those encounters. */
  readonly encounteredRelationshipIds: readonly string[]
  readonly exposedPersonHours: number
  readonly commonsPersonHours: number
  readonly curiosityPersonHourSum: number
  readonly socializeSelections: number
  readonly exploreSelections: number
  readonly explorationArrivals: number
  readonly mealAttempts: number
  readonly failedMeals: number
  readonly encounters: number
  readonly positiveEncounters: number
  readonly neutralEncounters: number
  readonly tenseEncounters: number
  /** One directional mean per resolved encounter, in canonical encounter order. */
  readonly postEncounterDirectionalTrustPermilleSum: number
  readonly postEncounterDirectionalFamiliarityPermilleSum: number
  readonly postEncounterDirectionalFearPermilleSum: number
  readonly foodAmountBeforeRegeneration: number
  readonly foodCapacity: number
}

export type CommunityEmergentValues = Record<CommunityEmergentId, number>

export interface CommunityState {
  readonly catchment: CommunityCatchment
  readonly emergent: CommunityEmergentValues
  readonly structural: Record<CommunityStructuralId, number>
}

export interface CommunityAggregationContributor {
  readonly sourceId: string
  readonly label: string
  readonly factor: string
  readonly sourceValuePermille: number
  readonly weightPermille: number
  readonly weightedNumerator: number
  /** Contribution relative to a neutral 500-permille observation. */
  readonly effectFromNeutralPermille: number
}

export interface CommunityAggregationTrace {
  readonly variableId: CommunityVariableId
  readonly previousValuePermille: number
  readonly observedValuePermille: number
  readonly nextValuePermille: number
  readonly previousWeightPermille: number
  readonly observedWeightPermille: number
  readonly frozen: boolean
  readonly windowStartTick: number
  readonly windowEndTick: number
  readonly contributors: readonly CommunityAggregationContributor[]
}

export interface CommunityAggregationResult {
  readonly state: CommunityState
  readonly traces: readonly CommunityAggregationTrace[]
}

export interface CommunityFeedbackEdgeDefinition {
  readonly id: string
  readonly sourceId: CommunityEmergentId
  readonly targetId: CommunityActionTarget
  readonly weightPermille: number
  readonly enabled: boolean
  readonly order: number
}

export interface CommunityFeedbackContribution {
  readonly edgeId: string
  readonly sourceId: CommunityEmergentId
  readonly targetId: CommunityActionTarget
  readonly sourceValuePermille: number
  readonly centeredSourcePermille: number
  readonly weightPermille: number
  readonly effect: number
}

export interface CommunityFeedbackEvaluation {
  readonly targetId: CommunityActionTarget
  readonly contributions: readonly CommunityFeedbackContribution[]
  readonly totalEffect: number
}

export interface CommunityFeedbackRegistry {
  readonly definitions: readonly CommunityFeedbackEdgeDefinition[]
  getByTarget(targetId: CommunityActionTarget): readonly CommunityFeedbackEdgeDefinition[]
}

export interface CatchmentAssignmentInput {
  readonly cells: readonly GeographicCell[]
  readonly width: number
  readonly height: number
}
