import type { GeographicCell, PersonState, SettlementScale, SettlementState } from '../domain/types'
import { hexDistance } from '../spatial/hex'
import { compareStableText } from '../../shared/stableOrder'

const ORDER: readonly SettlementScale[] = ['landmark', 'hamlet', 'village', 'town', 'city']
const ENTRY: Record<SettlementScale, number> = { landmark: 0, hamlet: 1, village: 25, town: 100, city: 300 }
export const SETTLEMENT_SCALE_RADIUS_CELLS = 4

export interface SettlementScaleEvidence { currentScale: SettlementScale; suggestedScale: SettlementScale; direction: 'stable' | 'growth-ready' | 'decline-ready'; population: number; densityPerHomeCell: number; resourceUnitsPerResident: number; accessPermille: number }

/** Pure, read-only scale recommendation. Hysteresis requires a 20% buffer before decline. */
export function evaluateSettlementScale(input: { currentScale: SettlementScale; population: number; homeCellCount: number; resourceCapacity: number; waterAccessCellCount: number }): SettlementScaleEvidence {
  const densityPerHomeCell = input.homeCellCount === 0 ? 0 : input.population / input.homeCellCount
  const resourceUnitsPerResident = input.population === 0 ? 0 : input.resourceCapacity / input.population
  const accessPermille = input.homeCellCount === 0 ? 0 : Math.min(1000, Math.round(input.waterAccessCellCount * 1000 / input.homeCellCount))
  const viable = resourceUnitsPerResident >= 1 && accessPermille >= 250
  const promoted = [...ORDER].reverse().find((scale) => input.population >= ENTRY[scale] && viable) ?? 'landmark'
  const currentIndex = ORDER.indexOf(input.currentScale)
  const promotedIndex = ORDER.indexOf(promoted)
  const declineThreshold = Math.floor(ENTRY[input.currentScale] * 0.8)
  const suggestedScale = promotedIndex > currentIndex ? promoted : input.population < declineThreshold || !viable ? ORDER[Math.max(0, currentIndex - 1)]! : input.currentScale
  return { currentScale: input.currentScale, suggestedScale, direction: suggestedScale === input.currentScale ? 'stable' : ORDER.indexOf(suggestedScale) > currentIndex ? 'growth-ready' : 'decline-ready', population: input.population, densityPerHomeCell, resourceUnitsPerResident, accessPermille }
}

export interface SettlementScaleTransition {
  settlementId: string
  previousScale: SettlementScale
  nextScale: SettlementScale
  evidence: SettlementScaleEvidence
}

/**
 * Establishes the first retained scale from observed homes only. Viability is
 * intentionally evaluated on later scheduled intervals so a newly authored
 * settlement does not silently lose its population-derived starting label.
 */
export function initializeSettlementScales(input: { settlements: SettlementState[]; cells: readonly GeographicCell[]; people: readonly PersonState[] }): void {
  const cellsById = new Map(input.cells.map((cell) => [cell.id, cell]))
  for (const settlement of input.settlements) {
    const anchor = cellsById.get(settlement.anchorCellId)
    const catchment = new Set(settlement.catchmentCellIds ?? (anchor ? input.cells.filter((cell) => hexDistance(anchor, cell) <= SETTLEMENT_SCALE_RADIUS_CELLS).map((cell) => cell.id) : []))
    const population = input.people.filter((person) => person.lifeStatus !== 'dead' && catchment.has(person.homeCellId)).length
    settlement.scale = scaleForPopulation(population)
  }
}

/**
 * Applies only the retained geographic scale. Homes, people, resources, and
 * catchments remain authoritative in their own systems; this function never
 * moves people or creates a demographic membership list.
 */
export function updateSettlementScales(input: { settlements: SettlementState[]; cells: readonly GeographicCell[]; people: readonly PersonState[] }): SettlementScaleTransition[] {
  const cellsById = new Map(input.cells.map((cell) => [cell.id, cell]))
  const waterCells = input.cells.filter((cell) => cell.terrain === 'water')
  const transitions: SettlementScaleTransition[] = []
  for (const settlement of [...input.settlements].sort((first, second) => compareStableText(first.id, second.id))) {
    const anchor = cellsById.get(settlement.anchorCellId)
    const catchmentIds = settlement.catchmentCellIds ?? (anchor ? input.cells.filter((cell) => hexDistance(anchor, cell) <= SETTLEMENT_SCALE_RADIUS_CELLS).map((cell) => cell.id) : [])
    const catchment = new Set(catchmentIds)
    const homeCellIds = new Set<string>()
    let population = 0
    for (const person of input.people) {
      if (person.lifeStatus === 'dead' || !catchment.has(person.homeCellId)) continue
      population += 1
      homeCellIds.add(person.homeCellId)
    }
    const resourceCapacity = catchmentIds.reduce((sum, cellId) => sum + (cellsById.get(cellId)?.resourceCapacity ?? 0), 0)
    const waterAccessCellCount = catchmentIds.filter((cellId) => {
      const cell = cellsById.get(cellId)
      return cell !== undefined && waterCells.some((water) => hexDistance(cell, water) <= 1)
    }).length
    const previousScale = settlement.scale ?? scaleForPopulation(population)
    const evidence = evaluateSettlementScale({ currentScale: previousScale, population, homeCellCount: homeCellIds.size, resourceCapacity, waterAccessCellCount })
    settlement.scale = evidence.suggestedScale
    if (evidence.suggestedScale !== previousScale) transitions.push({ settlementId: settlement.id, previousScale, nextScale: evidence.suggestedScale, evidence })
  }
  return transitions
}

export function scaleForPopulation(population: number): SettlementScale {
  if (population >= ENTRY.city) return 'city'
  if (population >= ENTRY.town) return 'town'
  if (population >= ENTRY.village) return 'village'
  if (population >= ENTRY.hamlet) return 'hamlet'
  return 'landmark'
}
