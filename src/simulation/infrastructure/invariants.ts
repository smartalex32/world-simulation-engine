import type { SimulationState } from '../domain/types'

/** Canonical validation owned by the infrastructure subsystem. */
export function validateInfrastructureState(state: SimulationState): void {
  if (!Array.isArray(state.infrastructure)) throw new Error('Simulation contains invalid infrastructure')
  const settlementIds = new Set(state.world.settlements.map((settlement) => settlement.id))
  const cellIds = new Set(state.world.grid.cells.map((cell) => cell.id))
  const ids = state.infrastructure.map((asset) => asset.id)
  if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && (ids[index - 1] as string) >= id)) throw new Error('Infrastructure assets are not canonically ordered')
  for (const asset of state.infrastructure) {
    if (asset.version !== 1 || !['road', 'waterway', 'port', 'storage', 'service'].includes(asset.kind) || !asset.id) throw new Error(`Infrastructure asset ${asset.id} has invalid identity`)
    if (asset.cellIds.length === 0 || new Set(asset.cellIds).size !== asset.cellIds.length || asset.cellIds.some((cellId, index) => !cellIds.has(cellId) || (index > 0 && (asset.cellIds[index - 1] as string) >= cellId))) throw new Error(`Infrastructure asset ${asset.id} has invalid cells`)
    if (asset.ownerSettlementId !== undefined && !settlementIds.has(asset.ownerSettlementId)) throw new Error(`Infrastructure asset ${asset.id} has missing owner ${asset.ownerSettlementId}`)
    if (!Number.isSafeInteger(asset.capacity) || asset.capacity < 0 || !Number.isSafeInteger(asset.maintenanceUnits) || asset.maintenanceUnits < 0 || [asset.conditionPermille, asset.disruptionPermille].some((value) => !Number.isSafeInteger(value) || value < 0 || value > 1000)) throw new Error(`Infrastructure asset ${asset.id} has invalid capacity state`)
  }
}
