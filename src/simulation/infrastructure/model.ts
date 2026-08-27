import type { GeographicCell, InfrastructureAssetState, MarketState, OrganizationState, RoadState, SettlementState } from '../domain/types'

/** Derives bounded runtime assets from real authored roads, water, markets, and services. */
export function createInfrastructureAssets(input: { roads: readonly RoadState[]; cells: readonly GeographicCell[]; settlements: readonly SettlementState[]; markets: readonly MarketState[]; organizations: readonly OrganizationState[]; tick: number }): InfrastructureAssetState[] {
  const cells = new Map(input.cells.map((cell) => [cell.id, cell]))
  const owner = (cellId: string) => input.settlements.filter((settlement) => settlement.regional?.extentCellIds.includes(cellId) || settlement.anchorCellId === cellId).sort((a, b) => a.id.localeCompare(b.id))[0]?.id
  const assets: InfrastructureAssetState[] = []
  for (const road of input.roads) assets.push(asset(`infrastructure.road.${road.id}`, 'road', road.cellIds, owner(road.cellIds[0]!), road.cellIds.length * 20, input.tick))
  const waterCells = input.cells.filter((cell) => cell.terrain === 'water').map((cell) => cell.id).sort()
  if (waterCells.length > 1) assets.push(asset('infrastructure.waterway.natural', 'waterway', waterCells, undefined, waterCells.length * 10, input.tick))
  for (const market of input.markets) assets.push(asset(`infrastructure.storage.${market.id}`, 'storage', [market.cellId], owner(market.cellId), 30, input.tick))
  for (const organization of input.organizations) assets.push(asset(`infrastructure.service.${organization.id}`, 'service', [organization.locationCellId], owner(organization.locationCellId), organization.serviceCapacity, input.tick))
  return assets.sort((a, b) => a.id.localeCompare(b.id))
}

/** Monthly deterministic maintenance cycle. Resources are explicit retained units, not currency. */
export function maintainInfrastructure(assets: InfrastructureAssetState[], tick: number): InfrastructureAssetState[] {
  const traces: InfrastructureAssetState[] = []
  for (const asset of [...assets].sort((a, b) => a.id.localeCompare(b.id))) {
    const previousConditionPermille = asset.conditionPermille
    const repaired = asset.maintenanceUnits > 0
    const delta = repaired ? Math.min(20, asset.maintenanceUnits) : -10
    asset.conditionPermille = Math.max(0, Math.min(1000, asset.conditionPermille + delta))
    if (repaired) asset.maintenanceUnits -= Math.min(asset.maintenanceUnits, 20)
    const kind = repaired ? 'maintained' : 'degraded'
    asset.lastTrace = { tick, kind, previousConditionPermille, conditionDeltaPermille: asset.conditionPermille - previousConditionPermille, capacity: effectiveCapacity(asset), reason: repaired ? 'retained maintenance units applied' : 'no maintenance units available' }
    traces.push(asset)
  }
  return traces
}

export function effectiveCapacity(asset: Pick<InfrastructureAssetState, 'capacity' | 'conditionPermille' | 'disruptionPermille'>): number { return Math.floor(asset.capacity * asset.conditionPermille * (1000 - asset.disruptionPermille) / 1_000_000) }

function asset(id: string, kind: InfrastructureAssetState['kind'], cellIds: readonly string[], ownerSettlementId: string | undefined, capacity: number, tick: number): InfrastructureAssetState {
  return { version: 1, id, kind, cellIds: [...cellIds].sort(), ...(ownerSettlementId ? { ownerSettlementId } : {}), capacity, conditionPermille: 1000, disruptionPermille: 0, maintenanceUnits: 0, lastTrace: { tick, kind: 'constructed', previousConditionPermille: 0, conditionDeltaPermille: 1000, capacity, reason: 'derived from authoritative geography or place service' } }
}
