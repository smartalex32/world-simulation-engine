/** Calendar-driven environmental modifiers. Values are permille multipliers;
 * this module is pure and consumes no simulation randomness. */
export const HOURS_PER_DAY = 24
export const DAYS_PER_SEASON = 30
export const HOURS_PER_SEASON = HOURS_PER_DAY * DAYS_PER_SEASON
export const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter'] as const
export type SeasonId = typeof SEASON_IDS[number]

export interface SeasonDefinition {
  id: SeasonId
  foodRegenerationMultiplierPermille: number
  movementCostMultiplierPermille: number
  thermalExposurePermille: number
}

export const SEASONS: readonly SeasonDefinition[] = Object.freeze([
  { id: 'spring', foodRegenerationMultiplierPermille: 1000, movementCostMultiplierPermille: 1000, thermalExposurePermille: 450 },
  { id: 'summer', foodRegenerationMultiplierPermille: 1200, movementCostMultiplierPermille: 950, thermalExposurePermille: 700 },
  { id: 'autumn', foodRegenerationMultiplierPermille: 850, movementCostMultiplierPermille: 1050, thermalExposurePermille: 400 },
  { id: 'winter', foodRegenerationMultiplierPermille: 500, movementCostMultiplierPermille: 1250, thermalExposurePermille: 150 },
])

export function seasonAtTick(tick: number): SeasonDefinition {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('Simulation tick must be a non-negative safe integer')
  return SEASONS[Math.floor(tick / HOURS_PER_SEASON) % SEASONS.length]!
}

export function seasonalAmount(baseAmount: number, multiplierPermille: number): number {
  if (!Number.isSafeInteger(baseAmount) || baseAmount < 0 || !Number.isSafeInteger(multiplierPermille) || multiplierPermille < 0) throw new RangeError('Seasonal values must be non-negative safe integers')
  return Math.floor(baseAmount * multiplierPermille / 1000)
}
