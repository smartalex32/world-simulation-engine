import type { SimulationState } from '../domain/types'

/** Canonical validation owned by the infrastructure subsystem. */
export function validateInfrastructureState(state: SimulationState): void {
  if (!Array.isArray(state.infrastructure)) throw new Error('Simulation contains invalid infrastructure')
  const settlementIds = new Set(state.world.settlements.map((settlement) => settlement.id))
  const organizations = new Map(state.organizations.map((organization) => [organization.id, organization]))
  const cellIds = new Set(state.world.grid.cells.map((cell) => cell.id))
  const ids = state.infrastructure.map((asset) => asset.id)
  if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && (ids[index - 1] as string) >= id)) throw new Error('Infrastructure assets are not canonically ordered')
  for (const asset of state.infrastructure) {
    if (asset.version !== 1 || !['road', 'waterway', 'port', 'storage', 'service'].includes(asset.kind) || !asset.id) throw new Error(`Infrastructure asset ${asset.id} has invalid identity`)
    if (asset.cellIds.length === 0 || new Set(asset.cellIds).size !== asset.cellIds.length || asset.cellIds.some((cellId, index) => !cellIds.has(cellId) || (index > 0 && (asset.cellIds[index - 1] as string) >= cellId))) throw new Error(`Infrastructure asset ${asset.id} has invalid cells`)
    if (asset.ownerSettlementId !== undefined && !settlementIds.has(asset.ownerSettlementId)) throw new Error(`Infrastructure asset ${asset.id} has missing owner ${asset.ownerSettlementId}`)
    if (!Number.isSafeInteger(asset.capacity) || asset.capacity < 0 || !Number.isSafeInteger(asset.maintenanceUnits) || asset.maintenanceUnits < 0 || [asset.conditionPermille, asset.disruptionPermille].some((value) => !Number.isSafeInteger(value) || value < 0 || value > 1000)) throw new Error(`Infrastructure asset ${asset.id} has invalid capacity state`)
    if (asset.operatorOrganizationId !== undefined) {
      const operator = organizations.get(asset.operatorOrganizationId)
      if (asset.kind !== 'service' || !operator || (asset.decommissionedTick === undefined && operator.status === 'dissolved')) throw new Error(`Infrastructure asset ${asset.id} has invalid service operator`)
    }
    if (asset.decommissionedTick !== undefined && (asset.kind !== 'service' || !Number.isSafeInteger(asset.decommissionedTick) || asset.decommissionedTick < 0 || asset.decommissionedTick > state.tick)) throw new Error(`Infrastructure asset ${asset.id} has invalid decommissioning state`)
    if (state.config.organizationEvolutionModelVersion === 1 && asset.kind === 'service' && asset.operatorOrganizationId === undefined) {
      const legacyOperatorId = asset.id.startsWith('infrastructure.service.') ? asset.id.slice('infrastructure.service.'.length).split('.transition.')[0] : undefined
      if (legacyOperatorId && organizations.get(legacyOperatorId)?.status === 'dissolved' && asset.decommissionedTick === undefined) throw new Error(`Infrastructure asset ${asset.id} has invalid legacy service operator`)
    }
  }
}
