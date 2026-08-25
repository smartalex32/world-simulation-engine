import type { GeographicCell, MarketState, OrganizationState, RoadState, SettlementState } from '../simulation/domain/types'
import { hexDistance } from '../simulation/spatial/hex'
import type { ProjectedSettlementService } from './types'

export const SETTLEMENT_SERVICE_RADIUS_CELLS = 4

/**
 * Summarizes only services physically inside a settlement's authored or
 * geographic catchment. It is display evidence, never settlement membership
 * or a direct person modifier.
 */
export function buildProjectedSettlementServices(settlements: readonly SettlementState[], cells: readonly GeographicCell[], markets: readonly MarketState[], organizations: readonly OrganizationState[], roads: readonly RoadState[] = []): ProjectedSettlementService[] {
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]))
  const roadCellIds = new Set(roads.flatMap((road) => road.cellIds))
  return [...settlements].sort((first, second) => first.id.localeCompare(second.id)).map((settlement) => {
    const anchor = cellsById.get(settlement.anchorCellId)
    const catchmentIds = settlement.catchmentCellIds ?? (anchor ? cells.filter((cell) => hexDistance(anchor, cell) <= SETTLEMENT_SERVICE_RADIUS_CELLS).map((cell) => cell.id) : [])
    const catchment = new Set(catchmentIds)
    const schools = organizations.filter((organization) => organization.kind === 'school' && catchment.has(organization.locationCellId))
    return {
      settlementId: settlement.id,
      marketCount: markets.filter((market) => catchment.has(market.cellId)).length,
      schoolCount: schools.length,
      schoolCapacity: schools.reduce((sum, school) => sum + school.serviceCapacity, 0),
      roadCellCount: catchmentIds.filter((cellId) => roadCellIds.has(cellId)).length,
    }
  })
}
