import type { GeographicCell, HouseholdState, InfrastructureAssetState, MarketState, OrganizationState, PopulationCohortState, SettlementMigrationTrace, SettlementRegionalState, SettlementState } from '../domain/types'
import { hexDistance } from '../spatial/hex'
import { effectiveCapacity } from '../infrastructure/model'
import { compareStableText } from '../../shared/stableOrder'

export interface SettlementRegionalTransition { settlementId: string; previousStatus: SettlementRegionalState['status']; nextStatus: SettlementRegionalState['status']; kind: NonNullable<SettlementRegionalState['lastTransition']>['kind']; reason: string }

/** Reconciles explicit settlement membership and capacity from authoritative
 * homes, services, inventories, roads, and terrain—not UI selection. */
export function reconcileSettlementRegions(input: { settlements: SettlementState[]; cells: readonly GeographicCell[]; households: readonly HouseholdState[]; cohorts?: readonly PopulationCohortState[]; markets: readonly MarketState[]; organizations: readonly OrganizationState[]; roads: readonly { cellIds: readonly string[] }[]; infrastructure?: readonly InfrastructureAssetState[]; tick: number }): SettlementRegionalTransition[] {
  const cells = new Map(input.cells.map((cell) => [cell.id, cell]))
  const roadCells = new Set(input.roads.flatMap((road) => road.cellIds))
  const transitions: SettlementRegionalTransition[] = []
  const settlementExtents = new Map(input.settlements.map((settlement) => {
    const anchor = cells.get(settlement.anchorCellId)
    if (!anchor) throw new Error(`Settlement ${settlement.id} has no anchor`)
    const extentCellIds = (settlement.catchmentCellIds ?? input.cells.filter((cell) => hexDistance(anchor, cell) <= 4).map((cell) => cell.id)).filter((id) => cells.get(id)?.movementCost).sort()
    return [settlement.id, extentCellIds] as const
  }))
  const ownerForCell = (cellId: string): string | undefined => {
    const cell = cells.get(cellId)
    if (!cell) return undefined
    return input.settlements
      .filter((settlement) => settlementExtents.get(settlement.id)?.includes(cellId))
      .sort((first, second) => hexDistance(cells.get(first.anchorCellId)!, cell) - hexDistance(cells.get(second.anchorCellId)!, cell) || compareStableText(first.id, second.id))[0]?.id
  }
  for (const settlement of [...input.settlements].sort((a, b) => compareStableText(a.id, b.id))) {
    const anchor = cells.get(settlement.anchorCellId)
    if (!anchor) throw new Error(`Settlement ${settlement.id} has no anchor`)
    const extentCellIds = settlementExtents.get(settlement.id) ?? []
    const extent = new Set(extentCellIds)
    const residents = input.households.filter((household) => extent.has(household.homeCellId) && ownerForCell(household.homeCellId) === settlement.id).sort((a, b) => compareStableText(a.id, b.id))
    const detailedResidentPopulationCount = residents.reduce((total, household) => total + household.memberIds.length, 0)
    const cohortResidentPopulationCount = (input.cohorts ?? []).reduce((total, cohort) => total + cohort.cellAllocations.filter((allocation) => extent.has(allocation.cellId) && ownerForCell(allocation.cellId) === settlement.id).reduce((allocationTotal, allocation) => allocationTotal + allocation.populationCount, 0), 0)
    const residentPopulationCount = detailedResidentPopulationCount + cohortResidentPopulationCount
    const marketIds = input.markets.filter((market) => extent.has(market.cellId)).map((market) => market.id).sort()
    const organizationIds = input.organizations.filter((organization) => extent.has(organization.locationCellId)).map((organization) => organization.id).sort()
    const food = residents.reduce((total, household) => total + (household.inventory?.food ?? 0), 0)
    const tools = residents.reduce((total, household) => total + (household.inventory?.tools ?? 0), 0)
    const foodCapacity = extentCellIds.reduce((total, id) => total + (cells.get(id)?.resourceCapacity ?? 0), 0)
    const infrastructure = (input.infrastructure ?? []).filter((asset) => asset.ownerSettlementId === settlement.id || asset.cellIds.some((id) => extent.has(id)))
    const serviceCapacity = input.infrastructure === undefined
      ? input.organizations.filter((organization) => organizationIds.includes(organization.id)).reduce((total, organization) => total + organization.serviceCapacity, 0)
      : infrastructure.filter((asset) => asset.kind === 'service').reduce((total, asset) => total + effectiveCapacity(asset), 0)
    const transportCells = new Set(infrastructure.filter((asset) => asset.kind === 'road' || asset.kind === 'waterway' || asset.kind === 'port').flatMap((asset) => asset.cellIds))
    const accessPermille = extentCellIds.length === 0 ? 0 : Math.round(extentCellIds.filter((id) => id === anchor.id || roadCells.has(id) || transportCells.has(id) || hexDistance(cells.get(id)!, anchor) <= 1).length * 1000 / extentCellIds.length)
    const previous = settlement.regional
    const housingCapacity = extentCellIds.length * 3
    const status: SettlementRegionalState['status'] = residentPopulationCount === 0 ? 'abandoned' : residentPopulationCount > housingCapacity || foodCapacity < residentPopulationCount ? 'contracting' : 'active'
    const membershipChanged = previous?.residentHouseholdIds.length !== residents.length || previous?.detailedResidentPopulationCount !== detailedResidentPopulationCount || previous?.cohortResidentPopulationCount !== cohortResidentPopulationCount
    const scaleChanged = previous?.scale !== settlement.scale
    const kind = !previous ? 'formed' : previous.status === 'abandoned' && status === 'active' ? 'resettled' : status === 'abandoned' ? 'abandoned' : status === 'contracting' ? 'contraction' : residentPopulationCount > (previous.detailedResidentPopulationCount + previous.cohortResidentPopulationCount) ? 'growth' : scaleChanged && (settlement.scale === 'city' || settlement.scale === 'town') ? 'urbanized' : scaleChanged ? 'ruralized' : 'growth'
    const reason = status === 'abandoned' ? 'no detailed or cohort residents' : residentPopulationCount > housingCapacity ? 'resident population exceeds housing capacity' : foodCapacity < residentPopulationCount ? 'resource capacity below resident population' : scaleChanged ? 'retained settlement scale changed from regional evidence' : 'homes, services, and access support the settlement'
    const changed = !previous || previous.status !== status || membershipChanged || scaleChanged
    const storageCapacity = infrastructure.filter((asset) => asset.kind === 'storage').reduce((total, asset) => total + effectiveCapacity(asset), 0)
    settlement.regional = { version: 1, status, extentCellIds, residentHouseholdIds: residents.map((household) => household.id), detailedResidentPopulationCount, cohortResidentPopulationCount, marketIds, organizationIds, accessPermille, capacity: { housing: housingCapacity, food: foodCapacity, services: serviceCapacity, materials: foodCapacity + storageCapacity }, materials: { food, tools }, scale: settlement.scale, ...(changed ? { lastTransition: { tick: input.tick, kind, reason } } : {}) }
    if (changed) transitions.push({ settlementId: settlement.id, previousStatus: previous?.status ?? 'abandoned', nextStatus: status, kind, reason })
  }
  return transitions
}

/** Causal settlement evidence for a real household relocation. Values describe
 * observed regional conditions; they do not assign settlement membership. */
export function settlementMigrationTrace(settlements: readonly SettlementState[], sourceCellId: string, destinationCellId: string, householdTiePermille: number, foodAccessDeltaPermille: number, travelCost: number, settlementByCellId?: ReadonlyMap<string, SettlementState>): SettlementMigrationTrace {
  const source = settlementByCellId ? settlementByCellId.get(sourceCellId) : settlementAtCell(settlements, sourceCellId)
  const destination = settlementByCellId ? settlementByCellId.get(destinationCellId) : settlementAtCell(settlements, destinationCellId)
  const regional = destination?.regional
  const residents = (regional?.detailedResidentPopulationCount ?? 0) + (regional?.cohortResidentPopulationCount ?? 0)
  return {
    ...(source === undefined ? {} : { sourceSettlementId: source.id }),
    ...(destination === undefined ? {} : { destinationSettlementId: destination.id }),
    employmentPermille: Math.min(1000, Math.floor((regional?.capacity.materials ?? 0) * 1000 / Math.max(1, residents * 3))),
    foodPermille: Math.max(0, Math.min(1000, 500 + foodAccessDeltaPermille)),
    housingPermille: Math.min(1000, Math.floor((regional?.capacity.housing ?? 0) * 1000 / Math.max(1, residents))),
    safetyPermille: regional?.status === 'active' ? 800 : regional?.status === 'contracting' ? 450 : 100,
    tiesPermille: householdTiePermille,
    infrastructurePermille: regional?.accessPermille ?? 0,
    servicesPermille: Math.min(1000, Math.floor((regional?.capacity.services ?? 0) * 1000 / Math.max(1, residents))),
    geographyPermille: Math.max(0, 1000 - Math.min(1000, Math.floor(travelCost / 10))),
    shockPermille: source?.regional?.status === 'contracting' ? 350 : source?.regional?.status === 'abandoned' ? 800 : 0,
  }
}

function settlementAtCell(settlements: readonly SettlementState[], cellId: string): SettlementState | undefined {
  return [...settlements]
    .filter((settlement) => settlement.regional?.extentCellIds.includes(cellId))
    .sort((first, second) => compareStableText(first.id, second.id))[0]
}

/** Moves a bounded aggregate allocation from a contracting/abandoned settlement
 * to an active one. Total cohort population is conserved exactly. */
export function migrateCohortsBetweenSettlements(cohorts: PopulationCohortState[], settlements: readonly SettlementState[], cells: readonly GeographicCell[], tick: number): NonNullable<PopulationCohortState['lastMigration']>[] {
  const destinations = settlements.filter((settlement) => settlement.regional?.status === 'active' && settlement.regional.capacity.housing > settlement.regional.detailedResidentPopulationCount + settlement.regional.cohortResidentPopulationCount).sort((a, b) => compareStableText(a.id, b.id))
  const sourceSettlements = settlements.filter((settlement) => settlement.regional?.status === 'contracting' || settlement.regional?.status === 'abandoned').sort((a, b) => compareStableText(a.id, b.id))
  const cellById = new Map(cells.map((cell) => [cell.id, cell]))
  const traces: NonNullable<PopulationCohortState['lastMigration']>[] = []
  for (const cohort of [...cohorts].sort((a, b) => compareStableText(a.id, b.id))) {
    const source = sourceSettlements.find((settlement) => cohort.cellAllocations.some((allocation) => settlement.regional?.extentCellIds.includes(allocation.cellId)))
    const destination = destinations.find((settlement) => settlement.id !== source?.id && cellById.get(settlement.anchorCellId)?.movementCost)
    if (!source || !destination) continue
    const allocation = cohort.cellAllocations.filter((candidate) => source.regional?.extentCellIds.includes(candidate.cellId)).sort((a, b) => b.populationCount - a.populationCount || compareStableText(a.cellId, b.cellId))[0]
    if (!allocation) continue
    const populationCount = Math.max(1, Math.floor(allocation.populationCount / 20))
    allocation.populationCount -= populationCount
    const existing = cohort.cellAllocations.find((candidate) => candidate.cellId === destination.anchorCellId)
    if (existing) existing.populationCount += populationCount
    else cohort.cellAllocations.push({ cellId: destination.anchorCellId, populationCount })
    cohort.cellAllocations = cohort.cellAllocations.filter((candidate) => candidate.populationCount > 0).sort((a, b) => compareStableText(a.cellId, b.cellId))
    cohort.eventTotals.migrationOut += populationCount
    cohort.eventTotals.migrationIn += populationCount
    const trace = { tick, sourceSettlementId: source.id, destinationSettlementId: destination.id, sourceCellId: allocation.cellId, destinationCellId: destination.anchorCellId, populationCount, reason: 'source settlement contraction and destination housing capacity' }
    cohort.lastMigration = trace; traces.push(trace)
  }
  return traces
}
