import type { SimulationState } from '../domain/types'
import {
  EMERGENT_OBSERVED_WEIGHT_PERMILLE,
  EMERGENT_PREVIOUS_WEIGHT_PERMILLE,
  STRUCTURAL_OBSERVED_WEIGHT_PERMILLE,
  STRUCTURAL_PREVIOUS_WEIGHT_PERMILLE,
  validateDailyCommunityCounters,
} from './aggregation'
import { createTwoCatchmentGeography } from './geography'
import { assertPermille, clampPermille, symmetricRoundDivision } from './math'
import { COMMUNITY_VARIABLE_DEFINITIONS } from './registry'
import {
  COMMUNITY_EMERGENT_IDS,
  COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID,
  type CommunityAggregationTrace,
  type CommunityVariableId,
} from './types'

const EXPECTED_CONTRIBUTORS: Readonly<Record<CommunityVariableId, readonly [string, number][]>> = {
  'community.emergent.socialTrust': [['encounter.outcomeQuality', 350], ['relationship.directionalTrust', 450], ['community.structural.foodSecurity.observed', 200]],
  'community.emergent.cohesion': [['encounter.participantReach', 300], ['relationship.directionalFamiliarity', 250], ['relationship.activeDensity.normalized', 250], ['activity.commonsShare', 200]],
  'community.emergent.cooperation': [['encounter.outcomeQuality', 450], ['action.socialize.rate', 300], ['relationship.directionalTrust', 250]],
  'community.emergent.conflict': [['encounter.tenseRate', 550], ['relationship.directionalFear', 300], ['community.structural.foodInsecurity.observed', 150]],
  'community.emergent.innovationClimate': [['action.explore.rate', 600], ['action.explorationArrival.rate', 250], ['exposure.curiosity', 150]],
  'community.structural.foodSecurity': [['environment.food.stockRatio', 700], ['resource.meal.success', 300]],
}

export function validateCommunitySimulationState(state: SimulationState): void {
  if (!Array.isArray(state.communities) || !Array.isArray(state.dailyCommunityCounters)) throw new Error('Simulation contains invalid community state')
  const expectedCatchments = createTwoCatchmentGeography({ cells: state.world.grid.cells, width: state.world.grid.width, height: state.world.grid.height })
  const communityIds = state.communities.map((community) => community.catchment.id)
  if (!sameStrings(communityIds, expectedCatchments.map((catchment) => catchment.id))) throw new Error('Communities are not in canonical registry order')
  const cellIds = new Set(state.world.grid.cells.map((cell) => cell.id))
  const passableCellIds = new Set(state.world.grid.cells.filter((cell) => cell.movementCost > 0).map((cell) => cell.id))
  const coveredCells: string[] = []
  const expectedLastUpdatedTick = Math.floor(state.tick / 24) * 24
  for (let index = 0; index < state.communities.length; index += 1) {
    const community = state.communities[index]
    const expected = expectedCatchments[index]
    if (!community || !expected) throw new Error('Community state does not match deterministic catchments')
    if (community.catchment.id !== expected.id || community.catchment.displayName !== expected.displayName || community.catchment.anchorCellId !== expected.anchorCellId || !sameStrings(community.catchment.cellIds, expected.cellIds)) {
      throw new Error(`Community ${community.catchment.id} has an invalid geographic catchment`)
    }
    if (!passableCellIds.has(community.catchment.anchorCellId) || !community.catchment.cellIds.includes(community.catchment.anchorCellId)) throw new Error(`Community ${community.catchment.id} has an invalid anchor`)
    if (!isCanonical(community.catchment.cellIds) || community.catchment.cellIds.some((cellId) => !cellIds.has(cellId))) throw new Error(`Community ${community.catchment.id} has invalid cell IDs`)
    coveredCells.push(...community.catchment.cellIds)
    if (!sameStrings(Object.keys(community.emergent).sort(), [...COMMUNITY_EMERGENT_IDS].sort())) throw new Error(`Community ${community.catchment.id} has invalid emergent variables`)
    if (!sameStrings(Object.keys(community.structural), [COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID])) throw new Error(`Community ${community.catchment.id} has invalid structural variables`)
    for (const id of COMMUNITY_EMERGENT_IDS) assertPermille(community.emergent[id], `${community.catchment.id} ${id}`)
    assertPermille(community.structural[COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID], `${community.catchment.id} food security`)
    if (!Number.isSafeInteger(community.lastUpdatedTick) || community.lastUpdatedTick !== expectedLastUpdatedTick) throw new Error(`Community ${community.catchment.id} has an invalid last update tick`)
    if (community.lastUpdatedTick === 0) {
      if (community.latestTraces.length !== 0) throw new Error(`Community ${community.catchment.id} has traces before its first update`)
    } else {
      const expectedIds = COMMUNITY_VARIABLE_DEFINITIONS.map((definition) => definition.id)
      if (!sameStrings(community.latestTraces.map((trace) => trace.variableId), expectedIds)) throw new Error(`Community ${community.catchment.id} has invalid latest trace order`)
      for (const trace of community.latestTraces) validateTrace(trace, community, community.lastUpdatedTick)
    }
  }
  if (!sameStrings(coveredCells.sort(), [...cellIds].sort())) throw new Error('Community catchments do not cover every world cell exactly once')

  const counterIds = state.dailyCommunityCounters.map((entry) => entry.communityId)
  if (!sameStrings(counterIds, communityIds)) throw new Error('Daily community counters are not in canonical registry order')
  const expectedWindowStart = Math.floor(state.tick / 24) * 24 + 1
  let exposedPersonHours = 0
  let encounters = 0
  let positive = 0
  let neutral = 0
  let tense = 0
  let failedMeals = 0
  const people = new Set(state.people.map((person) => person.id))
  const relationships = new Set(state.relationships.map((relationship) => relationship.id))
  for (const entry of state.dailyCommunityCounters) {
    const counters = entry.counters
    validateDailyCommunityCounters(counters)
    if (counters.windowStartTick !== expectedWindowStart || counters.windowEndTick !== expectedWindowStart + 23) throw new Error(`Community ${entry.communityId} has an invalid counter window`)
    if (counters.exposedPersonIds.some((id) => !people.has(id)) || counters.encounterParticipantIds.some((id) => !people.has(id))) throw new Error(`Community ${entry.communityId} contains unknown people`)
    if (counters.encounteredRelationshipIds.some((id) => !relationships.has(id))) throw new Error(`Community ${entry.communityId} contains unknown relationships`)
    exposedPersonHours += counters.exposedPersonHours
    encounters += counters.encounters
    positive += counters.positiveEncounters
    neutral += counters.neutralEncounters
    tense += counters.tenseEncounters
    failedMeals += counters.failedMeals
  }
  const elapsedHours = state.tick % 24
  const livingPeople = state.people.filter((person) => person.lifeStatus !== 'dead').length
  if (exposedPersonHours !== livingPeople * elapsedHours) throw new Error('Community person-hours do not match physical population exposure')
  if (encounters !== state.dailySocialCounters.encounters || positive !== state.dailySocialCounters.positiveEncounters || neutral !== state.dailySocialCounters.neutralEncounters || tense !== state.dailySocialCounters.tenseEncounters) throw new Error('Community encounter counters do not match global social counters')
  if (failedMeals !== state.dailySpatialCounters.failedMeals) throw new Error('Community failed meals do not match global spatial counters')
}

function validateTrace(trace: CommunityAggregationTrace, community: SimulationState['communities'][number], updateTick: number): void {
  const expected = EXPECTED_CONTRIBUTORS[trace.variableId]
  if (!expected || trace.windowStartTick !== updateTick - 23 || trace.windowEndTick !== updateTick) throw new Error(`Community ${community.catchment.id} has an invalid ${trace.variableId} trace window`)
  if (trace.contributors.length !== expected.length) throw new Error(`Community ${community.catchment.id} has invalid ${trace.variableId} contributors`)
  for (let index = 0; index < expected.length; index += 1) {
    const contributor = trace.contributors[index]
    const definition = expected[index]
    if (!contributor || !definition || contributor.sourceId !== definition[0] || contributor.factor !== definition[0] || contributor.weightPermille !== definition[1]) throw new Error(`Community ${community.catchment.id} has an invalid ${trace.variableId} contributor`)
    assertPermille(contributor.sourceValuePermille, contributor.sourceId)
    if (contributor.weightedNumerator !== contributor.sourceValuePermille * contributor.weightPermille) throw new Error(`Community ${community.catchment.id} has an invalid weighted contributor`)
    if (contributor.effectFromNeutralPermille !== symmetricRoundDivision((contributor.sourceValuePermille - 500) * contributor.weightPermille, 1000)) throw new Error(`Community ${community.catchment.id} has an invalid centered contributor effect`)
  }
  const expectedObserved = clampPermille(symmetricRoundDivision(trace.contributors.reduce((sum, contributor) => sum + contributor.weightedNumerator, 0), 1000))
  if (trace.observedValuePermille !== expectedObserved) throw new Error(`Community ${community.catchment.id} has an invalid observed ${trace.variableId} value`)
  const structural = trace.variableId === COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID
  const previousWeight = structural ? STRUCTURAL_PREVIOUS_WEIGHT_PERMILLE : EMERGENT_PREVIOUS_WEIGHT_PERMILLE
  const observedWeight = structural ? STRUCTURAL_OBSERVED_WEIGHT_PERMILLE : EMERGENT_OBSERVED_WEIGHT_PERMILLE
  if (trace.previousWeightPermille !== previousWeight || trace.observedWeightPermille !== observedWeight || (structural && trace.frozen)) throw new Error(`Community ${community.catchment.id} has invalid smoothing metadata`)
  const expectedNext = trace.frozen ? trace.previousValuePermille : clampPermille(symmetricRoundDivision(trace.previousValuePermille * previousWeight + trace.observedValuePermille * observedWeight, 1000))
  const actual = structural ? community.structural[trace.variableId] : community.emergent[trace.variableId]
  if (trace.nextValuePermille !== expectedNext || actual !== expectedNext) throw new Error(`Community ${community.catchment.id} has an inconsistent ${trace.variableId} result`)
}

function isCanonical(values: readonly string[]): boolean {
  return values.every((value, index) => Boolean(value) && (index === 0 || (values[index - 1] as string) < value))
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index])
}
