import type { ActionDecision, ActionName, GeographicCell, PersonState, UtilityContribution } from '../domain/types'
import type { CommunitySimulationState } from '../community/types'
import { evaluateCommunityFeedback } from '../community/feedback'
import { getCommunityVariableDefinition } from '../community/registry'
import type { Pcg32 } from '../rng/pcg32'
import { hexNeighbors } from '../spatial/hex'
import { evaluateInfluences } from '../influences/evaluate'
import { DECISION_INFLUENCE_TARGET } from '../influences/registry'
import type { DecisionInfluenceTarget } from '../influences/types'
import { PERSON_VARIABLE_ID, getPersonVariableDefinition } from '../variables/registry'
import { adjustPersonVariable, getPersonVariable } from '../variables/storage'
import {
  ACTION_BASE_WEIGHT,
  ACTION_WEIGHT_MAXIMUM,
  ACTION_WEIGHT_MINIMUM,
  DESTINATION_FOOD_WEIGHT_PERMILLE,
  FOOD_TO_HUNGER_RECOVERY,
  HOME_REST_WEIGHT,
  HOURLY_TRAVEL_BUDGET,
  LOCAL_FOOD_WEIGHT_CAP,
  MOVE_TRAVEL_COST_DIVISOR,
  NIGHTTIME_REST_WEIGHT,
  OTHER_OCCUPANT_SOCIAL_WEIGHT,
  PLAIN_MOVEMENT_COST,
  REST_FATIGUE_RECOVERY,
} from './actionConfig'

export interface Candidate {
  action: ActionName
  targetCellId?: string
  contributions: UtilityContribution[]
  weight: number
}

export interface ActionContext {
  tick: number
  cellById: ReadonlyMap<string, GeographicCell>
  occupantsByCell: ReadonlyMap<string, readonly string[]>
  occupantsByActivityLocation: ReadonlyMap<string, readonly string[]>
  /** Current authoritative catchment state indexed by actual world cell. */
  communityByCellId: ReadonlyMap<string, CommunitySimulationState>
}

export interface ActionOutcome {
  action: ActionName
  fromCellId: string
  targetCellId?: string
  arrived: boolean
  travelCost: number
  foodConsumed: number
  failedMeal: boolean
  hungerReduced: number
  fatigueReduced: number
}

export interface JourneyOutcome {
  kind: 'move' | 'explore'
  fromCellId: string
  targetCellId: string
  arrived: boolean
  travelCost: number
}

export function chooseAction(person: PersonState, context: ActionContext, rng: Pcg32): ActionDecision {
  const candidates = evaluateActions(person, context)
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
  let draw = rng.nextInt(totalWeight)
  let selected = candidates[candidates.length - 1]
  for (const candidate of candidates) {
    if (draw < candidate.weight) {
      selected = candidate
      break
    }
    draw -= candidate.weight
  }
  if (!selected) throw new Error(`Person ${person.id} has no available action`)
  return {
    tick: context.tick,
    action: selected.action,
    targetCellId: selected.targetCellId,
    weight: selected.weight,
    totalWeight,
    probabilityPermille: Math.round((selected.weight * 1000) / totalWeight),
    contributions: selected.contributions,
    alternatives: candidates.map(({ action, weight }) => ({ action, weight })),
  }
}

export function evaluateActions(person: PersonState, context: ActionContext): Candidate[] {
  const cell = context.cellById.get(person.locationCellId)
  if (!cell) throw new Error(`Person ${person.id} occupies missing cell ${person.locationCellId}`)
  const neighbors = passableNeighbors(cell, context.cellById)
  const known = new Set(person.knownCellIds)
  const moveTarget = bestDestination(neighbors.filter((neighbor) => known.has(neighbor.id)), person, context, false)
  const exploreTarget = bestDestination(neighbors.filter((neighbor) => !known.has(neighbor.id)), person, context, true)
  const activityLocationId = person.currentActivity.locationId
  const company = activityLocationId === null
    ? 0
    : Math.max(0, (context.occupantsByActivityLocation.get(activityLocationId)?.length ?? 1) - 1)
  const hunger = getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger)
  const hour = context.tick % 24
  const candidates: Candidate[] = []

  if (cell.foodAmount > 0 && hunger > 0) candidates.push(candidate('eat', [
    baseContribution(ACTION_BASE_WEIGHT.eat),
    ...personInfluenceContributions(DECISION_INFLUENCE_TARGET.eatUtility, person),
    contextContribution('local food', Math.min(LOCAL_FOOD_WEIGHT_CAP, cell.foodAmount)),
  ]))
  if (moveTarget) candidates.push(candidate('move', [
    baseContribution(ACTION_BASE_WEIGHT.move),
    ...personInfluenceContributions(DECISION_INFLUENCE_TARGET.moveUtility, person),
    contextContribution('destination food', Math.floor(moveTarget.foodAmount * DESTINATION_FOOD_WEIGHT_PERMILLE / 1000)),
    contextContribution('travel cost', -Math.floor(Math.max(0, moveTarget.movementCost - PLAIN_MOVEMENT_COST) / MOVE_TRAVEL_COST_DIVISOR)),
  ], moveTarget.id))
  if (exploreTarget) candidates.push(candidate('explore', [
    baseContribution(ACTION_BASE_WEIGHT.explore),
    ...personInfluenceContributions(DECISION_INFLUENCE_TARGET.exploreUtility, person),
    interactionContribution('terrain uncertainty', -Math.floor(
      Math.max(0, exploreTarget.movementCost - PLAIN_MOVEMENT_COST)
      * (1000 - getPersonVariable(person.variables, PERSON_VARIABLE_ID.riskTolerance))
      / 3000,
    )),
    ...communityInfluenceContributions('decision.explore.utility', person.locationCellId, context),
  ], exploreTarget.id))
  candidates.push(candidate('rest', [
    baseContribution(ACTION_BASE_WEIGHT.rest),
    contextContribution('nighttime', hour >= 21 || hour < 6 ? NIGHTTIME_REST_WEIGHT : 0),
    contextContribution('at home', person.locationCellId === person.homeCellId ? HOME_REST_WEIGHT : 0),
    ...personInfluenceContributions(DECISION_INFLUENCE_TARGET.restUtility, person),
  ]))
  if (company > 0) candidates.push(candidate('socialize', [
    baseContribution(ACTION_BASE_WEIGHT.socialize),
    ...personInfluenceContributions(DECISION_INFLUENCE_TARGET.socializeUtility, person),
    contextContribution('people present', company * OTHER_OCCUPANT_SOCIAL_WEIGHT),
    ...communityInfluenceContributions('decision.socialize.utility', person.locationCellId, context),
  ]))
  return candidates
}

export function resolveAction(person: PersonState, decision: ActionDecision, context: ActionContext): ActionOutcome {
  const fromCellId = person.locationCellId
  const outcome: ActionOutcome = { action: decision.action, fromCellId, targetCellId: decision.targetCellId, arrived: false, travelCost: 0, foodConsumed: 0, failedMeal: false, hungerReduced: 0, fatigueReduced: 0 }
  if (decision.action === 'eat') {
    const cell = context.cellById.get(person.locationCellId)
    if (!cell || cell.foodAmount <= 0) outcome.failedMeal = true
    else {
      const hunger = getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger)
      const desiredFood = Math.max(1, Math.min(160, Math.ceil(hunger / FOOD_TO_HUNGER_RECOVERY)))
      outcome.foodConsumed = Math.min(cell.foodAmount, desiredFood)
      cell.foodAmount -= outcome.foodConsumed
      const remainingHunger = adjustPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger, -outcome.foodConsumed * FOOD_TO_HUNGER_RECOVERY)
      outcome.hungerReduced = hunger - remainingHunger
    }
  } else if ((decision.action === 'move' || decision.action === 'explore') && decision.targetCellId) {
    const destination = context.cellById.get(decision.targetCellId)
    if (destination?.movementCost) {
      person.journey = { kind: decision.action, destinationCellId: destination.id, totalCost: destination.movementCost, remainingCost: destination.movementCost }
      const journey = advanceJourney(person, HOURLY_TRAVEL_BUDGET)
      outcome.arrived = journey?.arrived ?? false
      outcome.travelCost = journey?.travelCost ?? 0
    }
  } else if (decision.action === 'rest') {
    const fatigue = getPersonVariable(person.variables, PERSON_VARIABLE_ID.fatigue)
    const remainingFatigue = adjustPersonVariable(person.variables, PERSON_VARIABLE_ID.fatigue, -REST_FATIGUE_RECOVERY)
    outcome.fatigueReduced = fatigue - remainingFatigue
  }
  person.lastDecision = decision
  return outcome
}

export function advanceJourney(person: PersonState, hourlyBudget: number): JourneyOutcome | undefined {
  const journey = person.journey
  if (!journey) return undefined
  const fromCellId = person.locationCellId
  journey.remainingCost = Math.max(0, journey.remainingCost - hourlyBudget)
  if (journey.remainingCost > 0) return { kind: journey.kind, fromCellId, targetCellId: journey.destinationCellId, arrived: false, travelCost: 0 }
  person.locationCellId = journey.destinationCellId
  if (!person.knownCellIds.includes(journey.destinationCellId)) person.knownCellIds = [...person.knownCellIds, journey.destinationCellId].sort()
  person.journey = undefined
  return { kind: journey.kind, fromCellId, targetCellId: person.locationCellId, arrived: true, travelCost: journey.totalCost }
}

function candidate(action: ActionName, contributions: UtilityContribution[], targetCellId?: string): Candidate {
  return { action, targetCellId, contributions, weight: Math.max(ACTION_WEIGHT_MINIMUM, Math.min(ACTION_WEIGHT_MAXIMUM, contributions.reduce((sum, entry) => sum + entry.value, 0))) }
}

function bestDestination(options: GeographicCell[], person: PersonState, context: ActionContext, exploring: boolean): GeographicCell | undefined {
  return [...options].sort((a, b) => {
    const difference = destinationScore(b, person, context, exploring) - destinationScore(a, person, context, exploring)
    return difference || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  })[0]
}

function destinationScore(cell: GeographicCell, person: PersonState, context: ActionContext, exploring: boolean): number {
  const people = context.occupantsByCell.get(cell.id)?.length ?? 0
  const riskTolerance = getPersonVariable(person.variables, PERSON_VARIABLE_ID.riskTolerance)
  const sociability = getPersonVariable(person.variables, PERSON_VARIABLE_ID.sociability)
  const terrainPenalty = exploring
    ? Math.floor((cell.movementCost - PLAIN_MOVEMENT_COST) * (1000 - riskTolerance) / 1000)
    : cell.movementCost - PLAIN_MOVEMENT_COST
  return cell.foodAmount * 4 + Math.floor(people * sociability / 10) - terrainPenalty
}

function personInfluenceContributions(targetId: DecisionInfluenceTarget, person: PersonState): UtilityContribution[] {
  return evaluateInfluences(targetId, person.variables).contributions.map((contribution) => ({
    kind: 'influence',
    factor: getPersonVariableDefinition(contribution.sourceId).label.toLowerCase(),
    value: contribution.effect,
    edgeId: contribution.edgeId,
    sourceId: contribution.sourceId,
    targetId: contribution.targetId,
    sourceValue: contribution.sourceValue,
    weightPermille: contribution.weightPermille,
  }))
}

function communityInfluenceContributions(
  targetId: 'decision.socialize.utility' | 'decision.explore.utility',
  cellId: string,
  context: ActionContext,
): UtilityContribution[] {
  const community = context.communityByCellId.get(cellId)
  if (!community) return []
  return evaluateCommunityFeedback(targetId, community.emergent).contributions.map((contribution) => ({
    kind: 'communityInfluence',
    factor: getCommunityVariableDefinition(contribution.sourceId).label.toLowerCase(),
    value: contribution.effect,
    edgeId: contribution.edgeId,
    sourceId: contribution.sourceId,
    targetId: contribution.targetId,
    sourceValue: contribution.sourceValuePermille,
    centeredSourceValue: contribution.centeredSourcePermille,
    weightPermille: contribution.weightPermille,
    communityId: community.catchment.id,
  }))
}

function baseContribution(value: number): UtilityContribution {
  return { kind: 'base', factor: 'base', value }
}

function contextContribution(factor: string, value: number): UtilityContribution {
  return { kind: 'context', factor, value }
}

function interactionContribution(factor: string, value: number): UtilityContribution {
  return { kind: 'interaction', factor, value }
}

function passableNeighbors(cell: GeographicCell, cells: ReadonlyMap<string, GeographicCell>): GeographicCell[] {
  return hexNeighbors(cell)
    .map(({ q, r }) => cells.get(`${q},${r}`))
    .filter((neighbor): neighbor is GeographicCell => Boolean(neighbor?.movementCost))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
