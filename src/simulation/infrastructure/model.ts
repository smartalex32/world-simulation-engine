import type { GeographicCell, HouseholdState, InfrastructureAssetState, MarketState, OrganizationState, RoadState, SettlementState } from '../domain/types'
import { hexDistance } from '../spatial/hex'
import { compareStableText } from '../../shared/stableOrder'
import type { OrganizationTransitionTrace } from '../organizations/types'

/** Derives bounded runtime assets from real authored roads, water, markets, and services. */
export function createInfrastructureAssets(input: { roads: readonly RoadState[]; cells: readonly GeographicCell[]; settlements: readonly SettlementState[]; markets: readonly MarketState[]; organizations: readonly OrganizationState[]; tick: number }): InfrastructureAssetState[] {
  const cells = new Map(input.cells.map((cell) => [cell.id, cell]))
  const owner = (cellId: string) => input.settlements.filter((settlement) => settlement.regional?.extentCellIds.includes(cellId) || settlement.anchorCellId === cellId).sort((a, b) => compareStableText(a.id, b.id))[0]?.id
  const assets: InfrastructureAssetState[] = []
  for (const road of input.roads) assets.push(asset(`infrastructure.road.${road.id}`, 'road', road.cellIds, owner(road.cellIds[0]!), road.cellIds.length * 20, input.tick))
  const waterCells = input.cells.filter((cell) => cell.terrain === 'water').map((cell) => cell.id).sort()
  if (waterCells.length > 1) assets.push(asset('infrastructure.waterway.natural', 'waterway', waterCells, undefined, waterCells.length * 10, input.tick))
  for (const settlement of [...input.settlements].sort((a, b) => compareStableText(a.id, b.id))) {
    const anchor = cells.get(settlement.anchorCellId)
    const portCell = anchor && input.cells.filter((cell) => cell.terrain === 'water' && hexDistance(anchor, cell) <= 2).sort((a, b) => compareStableText(a.id, b.id))[0]
    if (portCell) assets.push(asset(`infrastructure.port.${settlement.id}`, 'port', [settlement.anchorCellId, portCell.id], settlement.id, 20, input.tick))
  }
  for (const market of input.markets) assets.push(asset(`infrastructure.storage.${market.id}`, 'storage', [market.cellId], owner(market.cellId), 30, input.tick))
  for (const organization of input.organizations) assets.push(asset(`infrastructure.service.${organization.id}`, 'service', [organization.locationCellId], owner(organization.locationCellId), organization.serviceCapacity, input.tick))
  return assets.sort((a, b) => compareStableText(a.id, b.id))
}

/** Monthly deterministic maintenance cycle. Resources are explicit retained units, not currency. */
export function maintainInfrastructure(assets: InfrastructureAssetState[], tick: number): InfrastructureAssetState[] {
  const traces: InfrastructureAssetState[] = []
  for (const asset of [...assets].sort((a, b) => compareStableText(a.id, b.id))) {
    if (asset.decommissionedTick !== undefined) continue
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
  for (const asset of [...assets].sort((a, b) => compareStableText(a.id, b.id))) {
    if (asset.decommissionedTick !== undefined) continue
    if (!asset.ownerSettlementId || asset.conditionPermille >= 1000) continue
    const settlement = settlements.find((candidate) => candidate.id === asset.ownerSettlementId)
    const candidates = households.filter((household) => household.inventory && household.inventory.tools > 0 && settlement?.regional?.extentCellIds.includes(household.homeCellId)).sort((a, b) => compareStableText(a.id, b.id))
    const household = candidates[0]
    if (!household?.inventory) continue
    household.inventory.tools -= 1
    asset.maintenanceUnits += 1
    allocations.push({ assetId: asset.id, householdId: household.id, units: 1 })
  }
  return allocations
}

export function effectiveCapacity(asset: Pick<InfrastructureAssetState, 'capacity' | 'conditionPermille' | 'disruptionPermille' | 'decommissionedTick'>): number { return asset.decommissionedTick === undefined ? Math.floor(asset.capacity * asset.conditionPermille * (1000 - asset.disruptionPermille) / 1_000_000) : 0 }

/** Resolves the explicit transition operator or the original service-ID
 * convention. This is intentionally read-only for legacy snapshots. */
export function serviceOperatorOrganizationId(asset: InfrastructureAssetState, organizations: readonly OrganizationState[]): string | undefined {
  if (asset.kind !== 'service') return undefined
  const id = asset.operatorOrganizationId ?? legacyServiceOperatorId(asset.id)
  return id && organizations.some((organization) => organization.id === id) ? id : undefined
}

/** Reconciles physical services after selected structural organization changes.
 * The caller owns transition selection and emits events from returned assets. */
export function reconcileOrganizationServiceInfrastructure(assets: InfrastructureAssetState[], organizations: readonly OrganizationState[], selectedTransitionTraces: readonly OrganizationTransitionTrace[], tick: number): InfrastructureAssetState[] {
  const changed = new Set<InfrastructureAssetState>()
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]))
  const operatorId = (asset: InfrastructureAssetState): string | undefined => {
    if (asset.kind !== 'service') return undefined
    const id = asset.operatorOrganizationId ?? legacyServiceOperatorId(asset.id)
    return id && organizationById.has(id) ? id : undefined
  }
  for (const trace of [...selectedTransitionTraces].filter((candidate) => candidate.selected).sort((a, b) => a.sequence - b.sequence)) {
    if (trace.kind === 'dissolution') {
      for (const asset of assets.filter((candidate) => { const operator = operatorId(candidate); return operator !== undefined && trace.sourceOrganizationIds.includes(operator) })) {
        if (asset.decommissionedTick === undefined) { asset.decommissionedTick = tick; structuralTrace(asset, tick, 'decommissioned', trace.sequence, 'organization dissolution retired this physical service'); changed.add(asset) }
      }
      continue
    }
    const childIds = trace.resultOrganizationIds.filter((id) => !trace.sourceOrganizationIds.includes(id) && organizationById.get(id)?.status !== 'dissolved').sort(compareStableText)
    if (childIds.length === 0) continue
    if (trace.kind === 'merger') {
      const childId = childIds[0]!
      for (const asset of assets.filter((candidate) => candidate.decommissionedTick === undefined && trace.sourceOrganizationIds.includes(operatorId(candidate) ?? ''))) {
        if (asset.operatorOrganizationId !== childId) { asset.operatorOrganizationId = childId; structuralTrace(asset, tick, 'transferred', trace.sequence, `organization merger transferred operation to ${childId}`); changed.add(asset) }
      }
      continue
    }
    for (const sourceId of [...trace.sourceOrganizationIds].sort(compareStableText)) {
      const before = trace.membershipsBefore.find((entry) => entry.organizationId === sourceId)?.members.length ?? 0
      const childWeights = childIds.map((id) => ({ id, members: trace.membershipsAfter.find((entry) => entry.organizationId === id)?.members.length ?? 0 }))
      const moving = childWeights.reduce((total, entry) => total + entry.members, 0)
      if (before === 0 || moving === 0 || moving >= before) continue
      for (const parentAsset of assets.filter((candidate) => operatorId(candidate) === sourceId && candidate.decommissionedTick === undefined)) {
        const capacities = splitAmounts(parentAsset.capacity, before, childWeights)
        const maintenance = splitAmounts(parentAsset.maintenanceUnits, before, childWeights)
        parentAsset.capacity -= capacities.reduce((total, entry) => total + entry.amount, 0)
        parentAsset.maintenanceUnits -= maintenance.reduce((total, entry) => total + entry.amount, 0)
        parentAsset.operatorOrganizationId ??= sourceId
        structuralTrace(parentAsset, tick, 'partitioned', trace.sequence, 'organization schism retained a partition of this physical service')
        changed.add(parentAsset)
        for (const child of childIds) {
          const id = serviceAssetId(child, trace.sequence, assets)
          if (assets.some((asset) => asset.id === id)) continue
          const capacity = capacities.find((entry) => entry.id === child)?.amount ?? 0
          const maintenanceUnits = maintenance.find((entry) => entry.id === child)?.amount ?? 0
          const asset: InfrastructureAssetState = { ...parentAsset, id, operatorOrganizationId: child, capacity, maintenanceUnits, cellIds: [...parentAsset.cellIds] }
          structuralTrace(asset, tick, 'partitioned', trace.sequence, `organization schism partitioned this physical service to ${child}`)
          assets.push(asset); changed.add(asset)
        }
      }
    }
  }
  assets.sort((a, b) => compareStableText(a.id, b.id))
  return [...changed].sort((a, b) => compareStableText(a.id, b.id))
}

function legacyServiceOperatorId(id: string): string | undefined { return id.startsWith('infrastructure.service.') ? id.slice('infrastructure.service.'.length).split('.transition.')[0] : undefined }
function serviceAssetId(organizationId: string, sequence: number, assets: readonly InfrastructureAssetState[]): string { const base = `infrastructure.service.${organizationId}.transition.${sequence}`; let id = base; let suffix = 1; while (assets.some((asset) => asset.id === id)) id = `${base}.${suffix++}`; return id }
function splitAmounts(amount: number, totalMembers: number, children: readonly { id: string; members: number }[]): { id: string; amount: number }[] { let allocatedMembers = 0; const total = BigInt(totalMembers); return [...children].sort((a, b) => compareStableText(a.id, b.id)).map((child) => { const previous = BigInt(amount) * BigInt(allocatedMembers) / total; allocatedMembers += child.members; return { id: child.id, amount: Number(BigInt(amount) * BigInt(allocatedMembers) / total - previous) } }) }
function structuralTrace(asset: InfrastructureAssetState, tick: number, kind: 'transferred' | 'partitioned' | 'decommissioned', sequence: number, reason: string): void { asset.lastTrace = { tick, kind, previousConditionPermille: asset.conditionPermille, conditionDeltaPermille: 0, capacity: effectiveCapacity(asset), reason: `${reason}; organization transition ${sequence}` } }

function asset(id: string, kind: InfrastructureAssetState['kind'], cellIds: readonly string[], ownerSettlementId: string | undefined, capacity: number, tick: number): InfrastructureAssetState {
  return { version: 1, id, kind, cellIds: [...cellIds].sort(), ...(ownerSettlementId ? { ownerSettlementId } : {}), capacity, conditionPermille: 1000, disruptionPermille: 0, maintenanceUnits: 0, lastTrace: { tick, kind: 'constructed', previousConditionPermille: 0, conditionDeltaPermille: 1000, capacity, reason: 'derived from authoritative geography or place service' } }
}
