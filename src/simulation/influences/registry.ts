import { PERSON_VARIABLE_ID } from '../variables/registry'
import { PERSON_VARIABLE_IDS } from '../variables/types'
import type {
  DecisionInfluenceTarget,
  InfluenceEdgeDefinition,
  InfluenceRegistry,
} from './types'
import { DECISION_INFLUENCE_TARGETS } from './types'

export const DECISION_INFLUENCE_TARGET = Object.freeze({
  eatUtility: 'decision.eat.utility',
  moveUtility: 'decision.move.utility',
  exploreUtility: 'decision.explore.utility',
  restUtility: 'decision.rest.utility',
  socializeUtility: 'decision.socialize.utility',
} as const satisfies Record<string, DecisionInfluenceTarget>)

const initialDefinitions = [
  {
    id: 'hunger-eat-utility',
    sourceId: PERSON_VARIABLE_ID.hunger,
    targetId: DECISION_INFLUENCE_TARGET.eatUtility,
    weightPermille: 900,
    curve: 'linear',
    timeHorizon: 'immediate',
    enabled: true,
    order: 10,
  },
  {
    id: 'hunger-move-utility',
    sourceId: PERSON_VARIABLE_ID.hunger,
    targetId: DECISION_INFLUENCE_TARGET.moveUtility,
    weightPermille: 120,
    curve: 'linear',
    timeHorizon: 'immediate',
    enabled: true,
    order: 20,
  },
  {
    id: 'sociability-move-utility',
    sourceId: PERSON_VARIABLE_ID.sociability,
    targetId: DECISION_INFLUENCE_TARGET.moveUtility,
    weightPermille: 80,
    curve: 'linear',
    timeHorizon: 'immediate',
    enabled: true,
    order: 30,
  },
  {
    id: 'curiosity-explore-utility',
    sourceId: PERSON_VARIABLE_ID.curiosity,
    targetId: DECISION_INFLUENCE_TARGET.exploreUtility,
    weightPermille: 800,
    curve: 'linear',
    timeHorizon: 'immediate',
    enabled: true,
    order: 40,
  },
  {
    id: 'risk-tolerance-explore-utility',
    sourceId: PERSON_VARIABLE_ID.riskTolerance,
    targetId: DECISION_INFLUENCE_TARGET.exploreUtility,
    weightPermille: 250,
    curve: 'linear',
    timeHorizon: 'immediate',
    enabled: true,
    order: 50,
  },
  {
    id: 'hunger-explore-utility',
    sourceId: PERSON_VARIABLE_ID.hunger,
    targetId: DECISION_INFLUENCE_TARGET.exploreUtility,
    weightPermille: -350,
    curve: 'linear',
    timeHorizon: 'immediate',
    enabled: true,
    order: 60,
  },
  {
    id: 'hunger-rest-utility',
    sourceId: PERSON_VARIABLE_ID.hunger,
    targetId: DECISION_INFLUENCE_TARGET.restUtility,
    weightPermille: -200,
    curve: 'linear',
    timeHorizon: 'immediate',
    enabled: true,
    order: 70,
  },
  {
    id: 'sociability-socialize-utility',
    sourceId: PERSON_VARIABLE_ID.sociability,
    targetId: DECISION_INFLUENCE_TARGET.socializeUtility,
    weightPermille: 750,
    curve: 'linear',
    timeHorizon: 'immediate',
    enabled: true,
    order: 80,
  },
  {
    id: 'hunger-socialize-utility',
    sourceId: PERSON_VARIABLE_ID.hunger,
    targetId: DECISION_INFLUENCE_TARGET.socializeUtility,
    weightPermille: -150,
    curve: 'linear',
    timeHorizon: 'immediate',
    enabled: true,
    order: 90,
  },
  {
    id: 'fatigue-rest-utility',
    sourceId: PERSON_VARIABLE_ID.fatigue,
    targetId: DECISION_INFLUENCE_TARGET.restUtility,
    weightPermille: 800,
    curve: 'linear',
    timeHorizon: 'immediate',
    enabled: true,
    order: 100,
  },
  {
    id: 'social-connection-socialize-utility',
    sourceId: PERSON_VARIABLE_ID.socialConnection,
    targetId: DECISION_INFLUENCE_TARGET.socializeUtility,
    weightPermille: 650,
    curve: 'linear',
    timeHorizon: 'immediate',
    enabled: true,
    order: 110,
  },
] as const satisfies readonly InfluenceEdgeDefinition[]

const knownSourceIds = new Set<string>(PERSON_VARIABLE_IDS)
const knownTargetIds = new Set<string>(DECISION_INFLUENCE_TARGETS)

export function createInfluenceRegistry(
  definitions: readonly InfluenceEdgeDefinition[],
): InfluenceRegistry {
  const edgeIds = new Set<string>()
  const frozenDefinitions = definitions.map((definition) => {
    if (edgeIds.has(definition.id)) throw new Error(`Duplicate influence edge ID: ${definition.id}`)
    if (!knownSourceIds.has(definition.sourceId)) {
      throw new Error(`Unknown influence source variable: ${definition.sourceId}`)
    }
    if (!knownTargetIds.has(definition.targetId)) {
      throw new Error(`Unknown influence target: ${definition.targetId}`)
    }
    if (!Number.isSafeInteger(definition.weightPermille)) {
      throw new Error(`Influence edge ${definition.id} must use an integer permille weight`)
    }
    if (!Number.isSafeInteger(definition.order)) {
      throw new Error(`Influence edge ${definition.id} must use an integer order`)
    }
    edgeIds.add(definition.id)
    return Object.freeze({ ...definition })
  })

  frozenDefinitions.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))

  const definitionsByTarget = new Map<DecisionInfluenceTarget, readonly InfluenceEdgeDefinition[]>()
  const mutableIndex = new Map<DecisionInfluenceTarget, InfluenceEdgeDefinition[]>()
  for (const definition of frozenDefinitions) {
    const targetDefinitions = mutableIndex.get(definition.targetId) ?? []
    targetDefinitions.push(definition)
    mutableIndex.set(definition.targetId, targetDefinitions)
  }
  for (const [targetId, targetDefinitions] of mutableIndex) {
    definitionsByTarget.set(targetId, Object.freeze([...targetDefinitions]))
  }

  const stableDefinitions = Object.freeze([...frozenDefinitions])
  return Object.freeze({
    definitions: stableDefinitions,
    getByTarget(targetId: DecisionInfluenceTarget): readonly InfluenceEdgeDefinition[] {
      return definitionsByTarget.get(targetId) ?? EMPTY_DEFINITIONS
    },
  })
}

const EMPTY_DEFINITIONS: readonly InfluenceEdgeDefinition[] = Object.freeze([])

export const INFLUENCE_DEFINITIONS: readonly InfluenceEdgeDefinition[] = Object.freeze(
  initialDefinitions.map((definition) => Object.freeze({ ...definition })),
)

export const INFLUENCE_REGISTRY = createInfluenceRegistry(INFLUENCE_DEFINITIONS)
