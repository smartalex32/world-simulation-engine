import type { GeographicCell, HexGrid } from '../domain/types'
import { climateConditionsAt, climateZoneForCell } from './climate'
import { deriveHydrology, type HydrologyCell } from './hydrology'

/** Stable ecological categories; these are derived evidence, never membership. */
export type BiomeId = 'open-water' | 'lake' | 'riverland' | 'temperate-grassland' | 'dry-scrub' | 'upland-heath'

export interface LivingEnvironmentCell {
  biomeId: BiomeId
  hydrology: HydrologyCell
  /** Renewable ecological productivity before human harvest, per mille. */
  ecologicalProductivityPermille: number
  /** Agricultural suitability before seasonal conditions, per mille. */
  agriculturalSuitabilityPermille: number
  /** Explainable, local environmental hazards only; no global disaster model. */
  hazardRiskPermille: number
  /** Current local demand divided by renewable capacity, bounded to 0–1000. */
  humanPressurePermille: number
}

/**
 * Derives local, inspectable environmental conditions.  Population input is a
 * snapshot of actual exposure/harvest pressure, so belonging to a settlement
 * does not transfer any environmental property to a person or cell.
 */
export function deriveLivingEnvironment(grid: HexGrid, tick: number, populationByCellId: ReadonlyMap<string, number> = new Map()): ReadonlyMap<string, LivingEnvironmentCell> {
  const hydrology = deriveHydrology(grid)
  return deriveLivingEnvironmentCells(grid.cells, tick, populationByCellId, hydrology.cells)
}

/** Derives only the requested cells when a viewport needs environmental detail. */
export function deriveLivingEnvironmentCells(cells: readonly GeographicCell[], tick: number, populationByCellId: ReadonlyMap<string, number>, hydrologyByCellId: ReadonlyMap<string, HydrologyCell>): ReadonlyMap<string, LivingEnvironmentCell> {
  const result = new Map<string, LivingEnvironmentCell>()
  for (const cell of cells) {
    const water = hydrologyByCellId.get(cell.id)
    if (!water) continue
    const climate = climateConditionsAt(cell, tick)
    const biomeId = biomeFor(cell, water)
    const ecologicalProductivityPermille = ecologyFor(cell, water, climate.waterAvailabilityPermille)
    const agriculturalSuitabilityPermille = agricultureFor(cell, water, climate.agriculturalProductivityPermille)
    const localPeople = populationByCellId.get(cell.id) ?? 0
    const humanPressurePermille = cell.resourceCapacity === 0 ? (localPeople === 0 ? 0 : 1000) : Math.min(1000, Math.floor(localPeople * 1000 / Math.max(1, cell.resourceCapacity)))
    // River proximity mitigates drought; steep uplands and closed basins retain
    // distinct local flood/erosion risks without adding mutable fluid state.
    const hazardRiskPermille = Math.min(1000, (water.river ? 260 : 0) + (water.lake ? 180 : 0) + (cell.terrain === 'hill' ? 170 : 0) + (climate.zoneId === 'dry' ? 150 : 0) + Math.floor(humanPressurePermille / 4))
    result.set(cell.id, { biomeId, hydrology: water, ecologicalProductivityPermille, agriculturalSuitabilityPermille, hazardRiskPermille, humanPressurePermille })
  }
  return result
}

function biomeFor(cell: GeographicCell, hydrology: HydrologyCell): BiomeId {
  if (cell.terrain === 'water') return 'open-water'
  if (hydrology.lake) return 'lake'
  if (hydrology.river) return 'riverland'
  if (cell.terrain === 'hill') return 'upland-heath'
  return climateZoneForCell(cell) === 'dry' ? 'dry-scrub' : 'temperate-grassland'
}

function ecologyFor(cell: GeographicCell, hydrology: HydrologyCell, waterAvailabilityPermille: number): number {
  if (cell.terrain === 'water') return 0
  const relief = cell.terrain === 'hill' ? 780 : 1000
  const water = hydrology.river || hydrology.lake ? Math.max(waterAvailabilityPermille, 900) : waterAvailabilityPermille
  return Math.max(0, Math.min(1000, Math.floor(relief * water / 1000)))
}

function agricultureFor(cell: GeographicCell, hydrology: HydrologyCell, seasonalProductivityPermille: number): number {
  if (cell.terrain !== 'plain') return 0
  const water = hydrology.river || hydrology.lake ? 1150 : 1000
  return Math.min(1000, Math.floor(seasonalProductivityPermille * water / 1000))
}
