import type { ActionDecision, ActionName, GeographicCell, PersonState, UtilityContribution } from '../domain/types'
import type { Pcg32 } from '../rng/pcg32'
import { hexNeighbors } from '../spatial/hex'

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
}

export interface ActionOutcome {
  action: ActionName
  fromCellId: string
  targetCellId?: string
  arrived: boolean
  travelCost: number
  foodConsumed: number
  failedMeal: boolean
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
  const company = Math.max(0, (context.occupantsByCell.get(cell.id)?.length ?? 1) - 1)
  const hour = context.tick % 24
  const candidates: Candidate[] = []

  if (cell.foodAmount > 0) candidates.push(candidate('eat', [
    { factor: 'base', value: 30 },
    { factor: 'hunger', value: Math.floor(person.hunger * 0.9) },
    { factor: 'local food', value: Math.min(300, cell.foodAmount) },
  ]))
  if (moveTarget) candidates.push(candidate('move', [
    { factor: 'base', value: 110 },
    { factor: 'hunger search', value: Math.floor(person.hunger * 0.12) },
    { factor: 'sociability', value: Math.floor(person.traits.sociability * 0.08) },
    { factor: 'destination food', value: Math.floor(moveTarget.foodAmount * 0.35) },
    { factor: 'travel cost', value: -Math.floor(Math.max(0, moveTarget.movementCost - 1000) / 3) },
  ], moveTarget.id))
  if (exploreTarget) candidates.push(candidate('explore', [
    { factor: 'base', value: 40 },
    { factor: 'curiosity', value: Math.floor(person.traits.curiosity * 0.8) },
    { factor: 'risk tolerance', value: Math.floor(person.traits.riskTolerance * 0.25) },
    { factor: 'hunger', value: -Math.floor(person.hunger * 0.35) },
    { factor: 'terrain uncertainty', value: -Math.floor(Math.max(0, exploreTarget.movementCost - 1000) * (1000 - person.traits.riskTolerance) / 3000) },
  ], exploreTarget.id))
  candidates.push(candidate('rest', [
    { factor: 'base', value: 120 },
    { factor: 'nighttime', value: hour >= 21 || hour < 6 ? 450 : 0 },
    { factor: 'at home', value: person.locationCellId === person.homeCellId ? 80 : 0 },
    { factor: 'hunger', value: -Math.floor(person.hunger * 0.2) },
  ]))
  if (company > 0) candidates.push(candidate('socialize', [
    { factor: 'base', value: 20 },
    { factor: 'sociability', value: Math.floor(person.traits.sociability * 0.75) },
    { factor: 'people present', value: company * 90 },
    { factor: 'hunger', value: -Math.floor(person.hunger * 0.15) },
  ]))
  return candidates
}

export function resolveAction(person: PersonState, decision: ActionDecision, context: ActionContext): ActionOutcome {
  const fromCellId = person.locationCellId
  const outcome: ActionOutcome = { action: decision.action, fromCellId, targetCellId: decision.targetCellId, arrived: false, travelCost: 0, foodConsumed: 0, failedMeal: false }
  if (decision.action === 'eat') {
    const cell = context.cellById.get(person.locationCellId)
    if (!cell || cell.foodAmount <= 0) outcome.failedMeal = true
    else {
      const desiredFood = Math.max(1, Math.min(160, Math.ceil(person.hunger / 2)))
      outcome.foodConsumed = Math.min(cell.foodAmount, desiredFood)
      cell.foodAmount -= outcome.foodConsumed
      person.hunger = Math.max(0, person.hunger - outcome.foodConsumed * 2)
    }
  } else if ((decision.action === 'move' || decision.action === 'explore') && decision.targetCellId) {
    const destination = context.cellById.get(decision.targetCellId)
    if (destination?.movementCost) {
      person.journey = { kind: decision.action, destinationCellId: destination.id, totalCost: destination.movementCost, remainingCost: destination.movementCost }
      const journey = advanceJourney(person, 1000)
      outcome.arrived = journey?.arrived ?? false
      outcome.travelCost = journey?.travelCost ?? 0
    }
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
  return { action, targetCellId, contributions, weight: Math.max(1, Math.min(10_000, contributions.reduce((sum, entry) => sum + entry.value, 0))) }
}

function bestDestination(options: GeographicCell[], person: PersonState, context: ActionContext, exploring: boolean): GeographicCell | undefined {
  return [...options].sort((a, b) => {
    const difference = destinationScore(b, person, context, exploring) - destinationScore(a, person, context, exploring)
    return difference || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  })[0]
}

function destinationScore(cell: GeographicCell, person: PersonState, context: ActionContext, exploring: boolean): number {
  const people = context.occupantsByCell.get(cell.id)?.length ?? 0
  const terrainPenalty = exploring
    ? Math.floor((cell.movementCost - 1000) * (1000 - person.traits.riskTolerance) / 1000)
    : cell.movementCost - 1000
  return cell.foodAmount * 4 + Math.floor(people * person.traits.sociability / 10) - terrainPenalty
}

function passableNeighbors(cell: GeographicCell, cells: ReadonlyMap<string, GeographicCell>): GeographicCell[] {
  return hexNeighbors(cell)
    .map(({ q, r }) => cells.get(`${q},${r}`))
    .filter((neighbor): neighbor is GeographicCell => Boolean(neighbor?.movementCost))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
