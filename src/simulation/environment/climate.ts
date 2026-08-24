import type { GeographicCell } from '../domain/types'
import { seasonalAmount, seasonAtTick, type SeasonId } from './season'

/** Static climate is derived from authored terrain/elevation, not stored as mutable world state. */
export type ClimateZoneId = 'temperate' | 'dry' | 'upland' | 'water'

export interface ClimateConditions {
  zoneId: ClimateZoneId
  seasonId: SeasonId
  waterAvailabilityPermille: number
  foodRegenerationMultiplierPermille: number
  agriculturalProductivityPermille: number
}

interface ClimateZoneDefinition {
  waterAvailabilityPermille: number
  foodRegenerationMultiplierPermille: number
  agriculturalProductivityPermille: number
}

const CLIMATE_ZONES: Readonly<Record<ClimateZoneId, ClimateZoneDefinition>> = Object.freeze({
  temperate: { waterAvailabilityPermille: 850, foodRegenerationMultiplierPermille: 1000, agriculturalProductivityPermille: 1000 },
  dry: { waterAvailabilityPermille: 430, foodRegenerationMultiplierPermille: 680, agriculturalProductivityPermille: 700 },
  upland: { waterAvailabilityPermille: 620, foodRegenerationMultiplierPermille: 760, agriculturalProductivityPermille: 540 },
  water: { waterAvailabilityPermille: 1000, foodRegenerationMultiplierPermille: 0, agriculturalProductivityPermille: 0 },
})

const SEASONAL_WATER_MULTIPLIER: Readonly<Record<SeasonId, number>> = Object.freeze({ spring: 1100, summer: 780, autumn: 900, winter: 1050 })
const SEASONAL_AGRICULTURE_MULTIPLIER: Readonly<Record<SeasonId, number>> = Object.freeze({ spring: 950, summer: 1250, autumn: 1100, winter: 350 })

export function climateZoneForCell(cell: GeographicCell): ClimateZoneId {
  if (cell.terrain === 'water') return 'water'
  if (cell.terrain === 'hill') return 'upland'
  return cell.elevation >= 460 ? 'dry' : 'temperate'
}

/** Pure integer conditions: no RNG, rendering, or wall-clock state participates. */
export function climateConditionsAt(cell: GeographicCell, tick: number): ClimateConditions {
  const season = seasonAtTick(tick)
  const zoneId = climateZoneForCell(cell)
  const zone = CLIMATE_ZONES[zoneId]
  const waterAvailabilityPermille = seasonalAmount(zone.waterAvailabilityPermille, SEASONAL_WATER_MULTIPLIER[season.id])
  return {
    zoneId,
    seasonId: season.id,
    waterAvailabilityPermille,
    foodRegenerationMultiplierPermille: seasonalAmount(season.foodRegenerationMultiplierPermille, zone.foodRegenerationMultiplierPermille),
    agriculturalProductivityPermille: seasonalAmount(seasonalAmount(zone.agriculturalProductivityPermille, SEASONAL_AGRICULTURE_MULTIPLIER[season.id]), waterAvailabilityPermille),
  }
}

export function regeneratedFoodAmount(cell: GeographicCell, tick: number): number {
  return seasonalAmount(cell.foodRegenerationPerDay, climateConditionsAt(cell, tick).foodRegenerationMultiplierPermille)
}

/** The initial agricultural activity is deliberately limited to fertile plain cells. */
export function isAgriculturalCell(cell: GeographicCell): boolean {
  return cell.terrain === 'plain' && cell.resourceCapacity > 0
}
