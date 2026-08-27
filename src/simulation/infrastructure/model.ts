import type { GeographicCell, HouseholdState, InfrastructureAssetState, MarketState, OrganizationState, RoadState, SettlementState } from '../domain/types'
import { hexDistance } from '../spatial/hex'

/** Derives bounded runtime assets from real authored roads, water, markets, and services. */
export function createInfrastructureAssets(input: { roads: readonly RoadState[]; cells: readonly GeographicCell[]; settlements: readonly SettlementState[]; markets: readonly MarketState[]; organizations: readonly OrganizationState[]; tick: number }): InfrastructureAssetState[] {
  const cells = new Map(input.cells.map((cell) => [cell.id, cell]))
  const owner = (cellId: string) => input.settlements.filter((settlement) => settlement.regional?.extentCellIds.includes(cellId) || settlement.anchorCellId === cellId).sort((a, b) => a.id.localeCompare(b.id))[0]?.id
  const assets: InfrastructureAssetState[] = []
  for (const road of input.roads) assets.push(asset(`infrastructure.road.${road.id}`, 'road', road.cellIds, owner(road.cellIds[0]!), road.cellIds.length * 20, input.tick))
  const waterCells = input.cells.filter((cell) => cell.terrain === 'water').map((cell) => cell.id).sort()
  if (waterCells.length > 1) assets.push(asset('infrastructure.waterway.natural', 'waterway', waterCells, undefined, waterCells.length * 10, input.tick))
  for (const settlement of [...input.settlements].sort((a, b) => a.id.localeCompare(b.id))) {
    const anchor = cells.get(settlement.anchorCellId)
    const portCell = anchor && input.cells.filter((cell) => cell.terrain === 'water' && hexDistance(anchor, cell) <= 2).sort((a, b) => a.id.localeCompare(b.id))[0]
    if (portCell) assets.push(asset(`infrastructure.port.${settlement.id}`, 'port', [settlement.anchorCellId, portCell.id], settlement.id, 20, input.tick))
  }
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
    const kind = repaired ? previousConditionPermille < 1000 ? 'repaired' : 'maintained' : 'degraded'
    asset.lastTrace = { tick, kind, previousConditionPermille, conditionDeltaPermille: asset.conditionPermille - previousConditionPermille, capacity: effectiveCapacity(asset), reason: repaired ? 'retained maintenance units applied' : 'no maintenance units available' }
    traces.push(asset)
  }
  return traces
}

/** Applies an explicit, inspectable service interruption. The caller owns the
 * causal event (for example a future flood or conflict system); this function
 * never invents randomness or hazards. */
export function disruptInfrastructure(asset: InfrastructureAssetState, disruptionPermille: number, tick: number, reason: string): InfrastructureAssetState {
  if (!Number.isSafeInteger(disruptionPermille) || disruptionPermille < 0 || disruptionPermille > 1000) throw new RangeError('Infrastructure disruption must be a permille value')
  const previousConditionPermille = asset.conditionPermille
  asset.disruptionPermille = disruptionPermille
  asset.lastTrace = { tick, kind: 'disrupted', previousConditionPermille, conditionDeltaPermille: 0, capacity: effectiveCapacity(asset), reason }
  return asset
}

/** Funds one unit of repair from a resident household's existing tool stock.
 * No currency, ambient state, or implicit settlement membership is used. */
export function allocateInfrastructureMaintenance(assets: InfrastructureAssetState[], households: HouseholdState[], settlements: readonly SettlementState[]): { assetId: string; householdId: string; units: number }[] {
  const allocations: { assetId: string; householdId: string; units: number }[] = []
  for (const asset of [...assets].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!asset.ownerSettlementId || asset.conditionPermille >= 1000) continue
    const settlement = settlements.find((candidate) => candidate.id === asset.ownerSettlementId)
    const candidates = households.filter((household) => household.inventory && household.inventory.tools > 0 && settlement?.regional?.extentCellIds.includes(household.homeCellId)).sort((a, b) => a.id.localeCompare(b.id))
    const household = candidates[0]
    if (!household?.inventory) continue
    household.inventory.tools -= 1
    asset.maintenanceUnits += 1
    allocations.push({ assetId: asset.id, householdId: household.id, units: 1 })
  }
  return allocations
}

export function effectiveCapacity(asset: Pick<InfrastructureAssetState, 'capacity' | 'conditionPermille' | 'disruptionPermille'>): number { return Math.floor(asset.capacity * asset.conditionPermille * (1000 - asset.disruptionPermille) / 1_000_000) }

function asset(id: string, kind: InfrastructureAssetState['kind'], cellIds: readonly string[], ownerSettlementId: string | undefined, capacity: number, tick: number): InfrastructureAssetState {
  return { version: 1, id, kind, cellIds: [...cellIds].sort(), ...(ownerSettlementId ? { ownerSettlementId } : {}), capacity, conditionPermille: 1000, disruptionPermille: 0, maintenanceUnits: 0, lastTrace: { tick, kind: 'constructed', previousConditionPermille: 0, conditionDeltaPermille: 1000, capacity, reason: 'derived from authoritative geography or place service' } }
}
