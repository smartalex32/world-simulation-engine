import type { GeographicCell, PersonState, SettlementState } from '../simulation/domain/types'
import { hexDistance } from '../simulation/spatial/hex'
import type { ProjectedSettlement, SettlementScale } from './types'

/**
 * Read-only display rules for authored settlement anchors. These are not a
 * demographic membership model: they summarize living people whose homes are
 * physically near the anchor at the current projection tick.
 */
export const SETTLEMENT_PROFILE_VERSION = 1
export const SETTLEMENT_PROFILE_RADIUS_CELLS = 4

export const SETTLEMENT_SCALE_THRESHOLDS = {
  hamlet: 1,
  village: 25,
  town: 100,
  city: 300,
} as const

export function buildProjectedSettlements(
  settlements: readonly SettlementState[],
  cells: readonly GeographicCell[],
  people: readonly PersonState[],
): ProjectedSettlement[] {
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]))
  return [...settlements]
    .sort((first, second) => first.id.localeCompare(second.id))
    .map((settlement) => {
      const anchor = cellsById.get(settlement.anchorCellId)
      const catchmentCellIds = settlement.catchmentCellIds ?? (anchor ? cells.filter((cell) => hexDistance(anchor, cell) <= SETTLEMENT_PROFILE_RADIUS_CELLS).map((cell) => cell.id) : [])
      const catchment = new Set(catchmentCellIds)
      const nearbyHomeCellIds = new Set<string>()
      let nearbyResidentCount = 0
      let currentVisitorCount = 0
      let catchmentResourceCapacity = 0
      let waterAccessCellCount = 0
      for (const cellId of catchment) catchmentResourceCapacity += cellsById.get(cellId)?.resourceCapacity ?? 0
      for (const cellId of catchment) {
        const cell = cellsById.get(cellId)
        if (cell && cells.some((candidate) => candidate.terrain === 'water' && hexDistance(cell, candidate) <= 1)) waterAccessCellCount += 1
      }
      if (anchor) {
        for (const person of people) {
          if (person.lifeStatus === 'dead') continue
          const home = cellsById.get(person.homeCellId)
          if (home && catchment.has(home.id)) { nearbyResidentCount += 1; nearbyHomeCellIds.add(home.id) }
          if (catchment.has(person.locationCellId) && !catchment.has(person.homeCellId)) currentVisitorCount += 1
        }
      }
      return {
        id: settlement.id,
        name: settlement.name,
        anchorCellId: settlement.anchorCellId,
        scale: settlementScaleForResidents(nearbyResidentCount),
        nearbyResidentCount,
        nearbyHomeCellCount: nearbyHomeCellIds.size,
        catchmentCellCount: catchment.size,
        catchmentSource: settlement.catchmentCellIds === undefined ? 'anchor-radius' : 'authored',
        currentVisitorCount,
        catchmentResourceCapacity,
        waterAccessCellCount,
      }
    })
}

export function settlementScaleForResidents(nearbyResidentCount: number): SettlementScale {
  if (nearbyResidentCount >= SETTLEMENT_SCALE_THRESHOLDS.city) return 'city'
  if (nearbyResidentCount >= SETTLEMENT_SCALE_THRESHOLDS.town) return 'town'
  if (nearbyResidentCount >= SETTLEMENT_SCALE_THRESHOLDS.village) return 'village'
  if (nearbyResidentCount >= SETTLEMENT_SCALE_THRESHOLDS.hamlet) return 'hamlet'
  return 'landmark'
}
