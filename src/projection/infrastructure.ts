import type { GeographicCell, InfrastructureAssetState, MarketState, OrganizationState, RoadState, SettlementState } from '../simulation/domain/types'
import { hexDistance } from '../simulation/spatial/hex'
import { effectiveCapacity } from '../simulation/infrastructure/model'
import type { ProjectedSettlementService } from './types'

export const SETTLEMENT_SERVICE_RADIUS_CELLS = 4

/**
 * Summarizes only services physically inside a settlement's authored or
 * geographic catchment. It is display evidence, never settlement membership
 * or a direct person modifier.
 */
export function buildProjectedSettlementServices(settlements: readonly SettlementState[], cells: readonly GeographicCell[], markets: readonly MarketState[], organizations: readonly OrganizationState[], roads: readonly RoadState[] = [], infrastructure: readonly InfrastructureAssetState[] = []): ProjectedSettlementService[] {
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]))
  const roadCellIds = new Set(roads.flatMap((road) => road.cellIds))
  return [...settlements].sort((first, second) => first.id.localeCompare(second.id)).map((settlement) => {
    const anchor = cellsById.get(settlement.anchorCellId)
    const catchmentIds = settlement.catchmentCellIds ?? (anchor ? cells.filter((cell) => hexDistance(anchor, cell) <= SETTLEMENT_SERVICE_RADIUS_CELLS).map((cell) => cell.id) : [])
    const catchment = new Set(catchmentIds)
    const schools = organizations.filter((organization) => organization.kind === 'school' && catchment.has(organization.locationCellId))
    const assets = infrastructure.filter((asset) => asset.ownerSettlementId === settlement.id || asset.cellIds.some((cellId) => catchment.has(cellId)))
    return {
      settlementId: settlement.id,
      marketCount: markets.filter((market) => catchment.has(market.cellId)).length,
      schoolCount: schools.length,
      schoolCapacity: schools.reduce((sum, school) => sum + school.serviceCapacity, 0),
      roadCellCount: catchmentIds.filter((cellId) => roadCellIds.has(cellId)).length,
      infrastructureCapacity: assets.reduce((sum, asset) => sum + effectiveCapacity(asset), 0),
      infrastructureConditionPermille: assets.length === 0 ? 0 : Math.floor(assets.reduce((sum, asset) => sum + asset.conditionPermille, 0) / assets.length),
      disruptedAssetCount: assets.filter((asset) => asset.disruptionPermille > 0).length,
    }
  })
}
