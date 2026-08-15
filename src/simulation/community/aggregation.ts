import { assertNonNegativeInteger, assertPermille, clampPermille, symmetricRoundDivision } from './math'
import { COMMUNITY_EMERGENT_IDS, COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID, type CommunityAggregationContributor, type CommunityAggregationResult, type CommunityAggregationTrace, type CommunityEmergentId, type CommunityState, type DailyCommunityCounters } from './types'

export const EMERGENT_PREVIOUS_WEIGHT_PERMILLE = 750
export const EMERGENT_OBSERVED_WEIGHT_PERMILLE = 250
export const STRUCTURAL_PREVIOUS_WEIGHT_PERMILLE = 500
export const STRUCTURAL_OBSERVED_WEIGHT_PERMILLE = 500
/** A raw fully-connected local network is normalized against this reference density. */
export const NETWORK_DENSITY_REFERENCE_PERMILLE = 100

/** Structural conditions may start from geography while emergent measures remain neutral. */
export function createCommunityState(catchment: CommunityState['catchment'], initialPermille = 500, initialFoodSecurityPermille = initialPermille): CommunityState {
  assertPermille(initialPermille, 'initialPermille')
  assertPermille(initialFoodSecurityPermille, 'initialFoodSecurityPermille')
  return Object.freeze({ catchment, emergent: Object.freeze(Object.fromEntries(COMMUNITY_EMERGENT_IDS.map((id) => [id, initialPermille])) as Record<CommunityEmergentId, number>), structural: Object.freeze({ [COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID]: initialFoodSecurityPermille }) })
}

/** Derives daily local observations then smooths them with integer fixed-point arithmetic. */
export function aggregateCommunityDaily(previous: CommunityState, counters: DailyCommunityCounters): CommunityAggregationResult {
  validateDailyCommunityCounters(counters)
  const measures = normalizedMeasures(previous, counters)
  const observedFood = weightedObservation([contributor('environment.food.stockRatio', 'Food stock ratio', measures.stockRatio, 700), contributor('resource.meal.success', 'Meal success', measures.mealSuccess, 300)])
  const formulas = observedEmergent({ ...measures, observedFoodSecurity: observedFood.value })
  const traces: CommunityAggregationTrace[] = []
  const emergent = {} as Record<CommunityEmergentId, number>
  for (const id of COMMUNITY_EMERGENT_IDS) {
    const old = previous.emergent[id]
    assertPermille(old, `previous ${id}`)
    const formula = formulas[id]
    const frozen = counters.exposedPersonHours === 0
    const next = frozen ? old : smooth(old, formula.value, EMERGENT_PREVIOUS_WEIGHT_PERMILLE, EMERGENT_OBSERVED_WEIGHT_PERMILLE)
    emergent[id] = next
    traces.push(trace(id, old, formula.value, next, EMERGENT_PREVIOUS_WEIGHT_PERMILLE, EMERGENT_OBSERVED_WEIGHT_PERMILLE, frozen, formula.contributors, counters))
  }
  const oldFood = previous.structural[COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID]
  const nextFood = smooth(oldFood, observedFood.value, STRUCTURAL_PREVIOUS_WEIGHT_PERMILLE, STRUCTURAL_OBSERVED_WEIGHT_PERMILLE)
  traces.push(trace(COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID, oldFood, observedFood.value, nextFood, STRUCTURAL_PREVIOUS_WEIGHT_PERMILLE, STRUCTURAL_OBSERVED_WEIGHT_PERMILLE, false, observedFood.contributors, counters))
  return Object.freeze({ state: Object.freeze({ catchment: previous.catchment, emergent: Object.freeze(emergent), structural: Object.freeze({ [COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID]: nextFood }) }), traces: Object.freeze(traces) })
}

function normalizedMeasures(previous: CommunityState, counters: DailyCommunityCounters) {
  const previousFood = previous.structural[COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID]
  const stockRatio = counters.foodCapacity === 0 ? previousFood : ratio(counters.foodAmountBeforeRegeneration, counters.foodCapacity)
  const mealSuccess = counters.mealAttempts === 0 ? stockRatio : ratio(counters.mealAttempts - counters.failedMeals, counters.mealAttempts)
  const outcomeQuality = counters.encounters === 0 ? previous.emergent['community.emergent.socialTrust'] : clampPermille(500 + symmetricRoundDivision((counters.positiveEncounters - counters.tenseEncounters) * 500, counters.encounters))
  const trust = counters.encounters === 0 ? previous.emergent['community.emergent.socialTrust'] : meanPermille(counters.postEncounterDirectionalTrustPermilleSum, counters.encounters)
  const familiarity = counters.encounters === 0 ? previous.emergent['community.emergent.cohesion'] : meanPermille(counters.postEncounterDirectionalFamiliarityPermilleSum, counters.encounters)
  const fear = counters.encounters === 0 ? previous.emergent['community.emergent.conflict'] : meanPermille(counters.postEncounterDirectionalFearPermilleSum, counters.encounters)
  const possiblePairs = counters.exposedPersonIds.length * (counters.exposedPersonIds.length - 1) / 2
  const rawDensityPermille = possiblePairs === 0 ? 0 : ratio(counters.encounteredRelationshipIds.length, possiblePairs)
  return {
    stockRatio, mealSuccess, outcomeQuality, trust, familiarity, fear,
    participantReach: counters.exposedPersonIds.length === 0 ? 0 : ratio(counters.encounterParticipantIds.length, counters.exposedPersonIds.length),
    normalizedDensity: clampPermille(symmetricRoundDivision(rawDensityPermille * 1000, NETWORK_DENSITY_REFERENCE_PERMILLE)),
    commonsShare: counters.exposedPersonHours === 0 ? 0 : ratio(counters.commonsPersonHours, counters.exposedPersonHours),
    socializeRate: actionRate(counters.socializeSelections, counters.exposedPersonHours),
    exploreRate: actionRate(counters.exploreSelections, counters.exposedPersonHours),
    arrivalRate: actionRate(counters.explorationArrivals, counters.exposedPersonHours),
    curiosityExposure: counters.exposedPersonHours === 0 ? 500 : meanPermille(counters.curiosityPersonHourSum, counters.exposedPersonHours),
    tenseRate: counters.encounters === 0 ? 0 : ratio(counters.tenseEncounters, counters.encounters),
  }
}

function observedEmergent(m: ReturnType<typeof normalizedMeasures> & { observedFoodSecurity: number }): Record<CommunityEmergentId, { value: number; contributors: CommunityAggregationContributor[] }> {
  return {
    'community.emergent.socialTrust': weightedObservation([contributor('encounter.outcomeQuality', 'Encounter outcome quality', m.outcomeQuality, 350), contributor('relationship.directionalTrust', 'Post-encounter directional trust', m.trust, 450), contributor('community.structural.foodSecurity.observed', 'Observed food security', m.observedFoodSecurity, 200)]),
    'community.emergent.cohesion': weightedObservation([contributor('encounter.participantReach', 'Encounter participant reach', m.participantReach, 300), contributor('relationship.directionalFamiliarity', 'Post-encounter directional familiarity', m.familiarity, 250), contributor('relationship.activeDensity.normalized', 'Active relationship density (normalized)', m.normalizedDensity, 250), contributor('activity.commonsShare', 'Commons exposure share', m.commonsShare, 200)]),
    'community.emergent.cooperation': weightedObservation([contributor('encounter.outcomeQuality', 'Encounter outcome quality', m.outcomeQuality, 450), contributor('action.socialize.rate', 'Socialize selections per person-day', m.socializeRate, 300), contributor('relationship.directionalTrust', 'Post-encounter directional trust', m.trust, 250)]),
    'community.emergent.conflict': weightedObservation([contributor('encounter.tenseRate', 'Tense encounter rate', m.tenseRate, 550), contributor('relationship.directionalFear', 'Post-encounter directional fear', m.fear, 300), contributor('community.structural.foodInsecurity.observed', 'Observed food insecurity', 1000 - m.observedFoodSecurity, 150)]),
    'community.emergent.innovationClimate': weightedObservation([contributor('action.explore.rate', 'Explore selections per person-day', m.exploreRate, 600), contributor('action.explorationArrival.rate', 'Exploration arrivals per person-day', m.arrivalRate, 250), contributor('exposure.curiosity', 'Exposure-weighted curiosity', m.curiosityExposure, 150)]),
  }
}

function contributor(sourceId: string, label: string, sourceValuePermille: number, weightPermille: number): CommunityAggregationContributor {
  assertPermille(sourceValuePermille, sourceId)
  const weightedNumerator = sourceValuePermille * weightPermille
  return Object.freeze({ sourceId, label, factor: sourceId, sourceValuePermille, weightPermille, weightedNumerator, effectFromNeutralPermille: symmetricRoundDivision((sourceValuePermille - 500) * weightPermille, 1000) })
}
function weightedObservation(contributors: readonly CommunityAggregationContributor[]): { value: number; contributors: CommunityAggregationContributor[] } {
  if (contributors.reduce((total, item) => total + item.weightPermille, 0) !== 1000) throw new Error('Community formula weights must sum to 1000')
  return { value: clampPermille(symmetricRoundDivision(contributors.reduce((total, item) => total + item.weightedNumerator, 0), 1000)), contributors: [...contributors] }
}
function trace(variableId: CommunityAggregationTrace['variableId'], previousValuePermille: number, observedValuePermille: number, nextValuePermille: number, previousWeightPermille: number, observedWeightPermille: number, frozen: boolean, contributors: CommunityAggregationContributor[], counters: DailyCommunityCounters): CommunityAggregationTrace {
  return Object.freeze({ variableId, previousValuePermille, observedValuePermille, nextValuePermille, previousWeightPermille, observedWeightPermille, frozen, windowStartTick: counters.windowStartTick, windowEndTick: counters.windowEndTick, contributors: Object.freeze(contributors) })
}
function ratio(numerator: number, denominator: number): number { return denominator <= 0 ? 0 : clampPermille(symmetricRoundDivision(numerator * 1000, denominator)) }
/** Permille-valued samples must not be scaled again when calculating their arithmetic mean. */
export function meanPermille(sumPermille: number, count: number): number { return count <= 0 ? 0 : clampPermille(symmetricRoundDivision(sumPermille, count)) }
function actionRate(count: number, hours: number): number { return hours === 0 ? 0 : clampPermille(symmetricRoundDivision(count * 24 * 1000, hours)) }
function smooth(previous: number, observed: number, oldWeight: number, newWeight: number): number { return clampPermille(symmetricRoundDivision(previous * oldWeight + observed * newWeight, 1000)) }

export function validateDailyCommunityCounters(counters: DailyCommunityCounters): void {
  if (!Number.isSafeInteger(counters.windowStartTick) || !Number.isSafeInteger(counters.windowEndTick) || counters.windowStartTick < 0 || counters.windowEndTick < counters.windowStartTick) throw new Error('Community counter window is invalid')
  for (const [key, value] of Object.entries(counters)) if (typeof value === 'number' && key !== 'windowStartTick' && key !== 'windowEndTick') assertNonNegativeInteger(value, key)
  for (const [name, values] of [['exposedPersonIds', counters.exposedPersonIds], ['encounterParticipantIds', counters.encounterParticipantIds], ['encounteredRelationshipIds', counters.encounteredRelationshipIds]] as const) validateCanonicalIds(values, name)
  if (counters.commonsPersonHours > counters.exposedPersonHours) throw new Error('commonsPersonHours cannot exceed exposedPersonHours')
  if (counters.failedMeals > counters.mealAttempts) throw new Error('failedMeals cannot exceed mealAttempts')
  if (counters.positiveEncounters + counters.neutralEncounters + counters.tenseEncounters !== counters.encounters) throw new Error('Encounter outcomes must sum to encounters')
  if (!counters.encounterParticipantIds.every((id) => counters.exposedPersonIds.includes(id))) throw new Error('Encounter participants must be exposed people')
  const possiblePairs = counters.exposedPersonIds.length * (counters.exposedPersonIds.length - 1) / 2
  if (counters.encounteredRelationshipIds.length > possiblePairs) throw new Error('Encountered relationships exceed possible exposed pairs')
  if (counters.encounters === 0 && (counters.postEncounterDirectionalTrustPermilleSum !== 0 || counters.postEncounterDirectionalFamiliarityPermilleSum !== 0 || counters.postEncounterDirectionalFearPermilleSum !== 0)) throw new Error('Post-encounter sums require encounters')
  for (const value of [counters.postEncounterDirectionalTrustPermilleSum, counters.postEncounterDirectionalFamiliarityPermilleSum, counters.postEncounterDirectionalFearPermilleSum]) if (value > counters.encounters * 1000) throw new Error('Post-encounter directional sum exceeds permille bounds')
  if (counters.curiosityPersonHourSum > counters.exposedPersonHours * 1000) throw new Error('curiosityPersonHourSum exceeds permille bounds')
}
function validateCanonicalIds(values: readonly string[], name: string): void { if (!values.every((value, index) => Boolean(value) && (index === 0 || values[index - 1]! < value))) throw new Error(`${name} must be canonical sorted unique IDs`) }
