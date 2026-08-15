import type { ActionDecision, ActionName, GeographicCell, PersonState, UtilityContribution } from '../domain/types'
import type { Pcg32 } from '../rng/pcg32'
import { hexNeighbors } from '../spatial/hex'

interface Candidate {
  action: ActionName
  contributions: UtilityContribution[]
  weight: number
}

export interface ActionContext {
  tick: number
  cellById: ReadonlyMap<string, GeographicCell>
  occupantsByCell: ReadonlyMap<string, readonly string[]>
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
  const targetCellId = chooseTarget(person, selected.action, context, rng)
  return {
    tick: context.tick,
    action: selected.action,
    targetCellId,
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
  const unknownNeighbors = neighbors.filter((neighbor) => !known.has(neighbor.id))
  const company = Math.max(0, (context.occupantsByCell.get(cell.id)?.length ?? 1) - 1)
  const hour = context.tick % 24
  const candidates: Candidate[] = []

  if (cell.resourceCapacity > 0) candidates.push(candidate('eat', [
    { factor: 'base', value: 30 },
    { factor: 'hunger', value: Math.floor(person.hunger * 0.9) },
    { factor: 'local food', value: cell.resourceCapacity },
  ]))
  if (neighbors.length > 0) candidates.push(candidate('move', [
    { factor: 'base', value: 110 },
    { factor: 'hunger search', value: Math.floor(person.hunger * 0.12) },
    { factor: 'sociability', value: Math.floor(person.traits.sociability * 0.08) },
  ]))
  if (unknownNeighbors.length > 0) candidates.push(candidate('explore', [
    { factor: 'base', value: 40 },
    { factor: 'curiosity', value: Math.floor(person.traits.curiosity * 0.8) },
    { factor: 'risk tolerance', value: Math.floor(person.traits.riskTolerance * 0.25) },
    { factor: 'hunger', value: -Math.floor(person.hunger * 0.35) },
  ]))
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

export function applyAction(person: PersonState, decision: ActionDecision, context: ActionContext): void {
  if (decision.action === 'eat') {
    const cell = context.cellById.get(person.locationCellId)
    person.hunger = Math.max(0, person.hunger - 260 - Math.floor((cell?.resourceCapacity ?? 0) / 2))
  } else if ((decision.action === 'move' || decision.action === 'explore') && decision.targetCellId) {
    person.locationCellId = decision.targetCellId
    if (!person.knownCellIds.includes(decision.targetCellId)) person.knownCellIds = [...person.knownCellIds, decision.targetCellId].sort()
  }
  person.lastDecision = decision
}

function candidate(action: ActionName, contributions: UtilityContribution[]): Candidate {
  return { action, contributions, weight: Math.max(1, Math.min(10_000, contributions.reduce((sum, entry) => sum + entry.value, 0))) }
}

function chooseTarget(person: PersonState, action: ActionName, context: ActionContext, rng: Pcg32): string | undefined {
  if (action !== 'move' && action !== 'explore') return undefined
  const current = context.cellById.get(person.locationCellId)
  if (!current) return undefined
  const neighbors = passableNeighbors(current, context.cellById)
  const known = new Set(person.knownCellIds)
  const options = action === 'explore' ? neighbors.filter((cell) => !known.has(cell.id)) : neighbors
  if (options.length === 0) return undefined
  const weights = options.map((cell) => action === 'explore'
    ? 50 + Math.floor(person.traits.riskTolerance / Math.max(1, cell.movementCost / 100))
    : 50 + cell.resourceCapacity + Math.floor((context.occupantsByCell.get(cell.id)?.length ?? 0) * person.traits.sociability / 100))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let draw = rng.nextInt(total)
  for (let index = 0; index < options.length; index += 1) {
    const weight = weights[index] ?? 0
    if (draw < weight) return options[index]?.id
    draw -= weight
  }
  return options[options.length - 1]?.id
}

function passableNeighbors(cell: GeographicCell, cells: ReadonlyMap<string, GeographicCell>): GeographicCell[] {
  return hexNeighbors(cell)
    .map(({ q, r }) => cells.get(`${q},${r}`))
    .filter((neighbor): neighbor is GeographicCell => Boolean(neighbor?.movementCost))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
