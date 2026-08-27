import type { GeographicCell, HouseholdState, MarketState, OrganizationState, PopulationCohortState, SettlementMigrationTrace, SettlementRegionalState, SettlementState } from '../domain/types'
import { hexDistance } from '../spatial/hex'

export interface SettlementRegionalTransition { settlementId: string; previousStatus: SettlementRegionalState['status']; nextStatus: SettlementRegionalState['status']; kind: NonNullable<SettlementRegionalState['lastTransition']>['kind']; reason: string }

/** Reconciles explicit settlement membership and capacity from authoritative
 * homes, services, inventories, roads, and terrain—not UI selection. */
export function reconcileSettlementRegions(input: { settlements: SettlementState[]; cells: readonly GeographicCell[]; households: readonly HouseholdState[]; markets: readonly MarketState[]; organizations: readonly OrganizationState[]; roads: readonly { cellIds: readonly string[] }[]; tick: number }): SettlementRegionalTransition[] {
  const cells = new Map(input.cells.map((cell) => [cell.id, cell]))
  const roadCells = new Set(input.roads.flatMap((road) => road.cellIds))
  const transitions: SettlementRegionalTransition[] = []
  for (const settlement of [...input.settlements].sort((a, b) => a.id.localeCompare(b.id))) {
    const anchor = cells.get(settlement.anchorCellId)
    if (!anchor) throw new Error(`Settlement ${settlement.id} has no anchor`)
    const extentCellIds = (settlement.catchmentCellIds ?? input.cells.filter((cell) => hexDistance(anchor, cell) <= 4).map((cell) => cell.id)).filter((id) => cells.get(id)?.movementCost).sort()
    const extent = new Set(extentCellIds)
    const residents = input.households.filter((household) => extent.has(household.homeCellId)).sort((a, b) => a.id.localeCompare(b.id))
    const marketIds = input.markets.filter((market) => extent.has(market.cellId)).map((market) => market.id).sort()
    const organizationIds = input.organizations.filter((organization) => extent.has(organization.locationCellId)).map((organization) => organization.id).sort()
    const food = residents.reduce((total, household) => total + (household.inventory?.food ?? 0), 0)
    const tools = residents.reduce((total, household) => total + (household.inventory?.tools ?? 0), 0)
    const foodCapacity = extentCellIds.reduce((total, id) => total + (cells.get(id)?.resourceCapacity ?? 0), 0)
    const serviceCapacity = input.organizations.filter((organization) => organizationIds.includes(organization.id)).reduce((total, organization) => total + organization.serviceCapacity, 0)
    const accessPermille = extentCellIds.length === 0 ? 0 : Math.round(extentCellIds.filter((id) => id === anchor.id || roadCells.has(id) || hexDistance(cells.get(id)!, anchor) <= 1).length * 1000 / extentCellIds.length)
    const previous = settlement.regional
    const status: SettlementRegionalState['status'] = residents.length === 0 ? 'abandoned' : residents.length * 3 < Math.max(1, extentCellIds.length) ? 'contracting' : 'active'
    const kind = !previous ? 'formed' : previous.status === 'abandoned' && status === 'active' ? 'resettled' : status === 'abandoned' ? 'abandoned' : status === 'contracting' ? 'contraction' : residents.length > previous.residentHouseholdIds.length ? 'growth' : settlement.scale === 'city' || settlement.scale === 'town' ? 'urbanized' : 'ruralized'
    const reason = status === 'abandoned' ? 'no resident households' : status === 'contracting' ? 'low household density across settlement extent' : foodCapacity < residents.length ? 'resource capacity below resident households' : 'homes, services, and access support the settlement'
    settlement.regional = { version: 1, status, extentCellIds, residentHouseholdIds: residents.map((household) => household.id), marketIds, organizationIds, accessPermille, capacity: { housing: extentCellIds.length * 3, food: foodCapacity, services: serviceCapacity, materials: foodCapacity }, materials: { food, tools }, ...(previous?.status === status && previous.residentHouseholdIds.length === residents.length ? {} : { lastTransition: { tick: input.tick, kind, reason } }) }
    if (!previous || previous.status !== status || previous.residentHouseholdIds.length !== residents.length) transitions.push({ settlementId: settlement.id, previousStatus: previous?.status ?? 'abandoned', nextStatus: status, kind, reason })
  }
  return transitions
}

/** Causal settlement evidence for a real household relocation. Values describe
 * observed regional conditions; they do not assign settlement membership. */
export function settlementMigrationTrace(settlements: readonly SettlementState[], sourceCellId: string, destinationCellId: string, householdTiePermille: number, foodAccessDeltaPermille: number, travelCost: number): SettlementMigrationTrace {
  const source = settlements.find((settlement) => settlement.regional?.extentCellIds.includes(sourceCellId))
  const destination = settlements.find((settlement) => settlement.regional?.extentCellIds.includes(destinationCellId))
  const regional = destination?.regional
  const residents = regional?.residentHouseholdIds.length ?? 0
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

/** Moves a bounded aggregate allocation from a contracting/abandoned settlement
 * to an active one. Total cohort population is conserved exactly. */
export function migrateCohortsBetweenSettlements(cohorts: PopulationCohortState[], settlements: readonly SettlementState[], cells: readonly GeographicCell[], tick: number): NonNullable<PopulationCohortState['lastMigration']>[] {
  const destinations = settlements.filter((settlement) => settlement.regional?.status === 'active' && settlement.regional.capacity.housing > settlement.regional.residentHouseholdIds.length * 3).sort((a, b) => a.id.localeCompare(b.id))
  const sourceSettlements = settlements.filter((settlement) => settlement.regional?.status === 'contracting' || settlement.regional?.status === 'abandoned').sort((a, b) => a.id.localeCompare(b.id))
  const cellById = new Map(cells.map((cell) => [cell.id, cell]))
  const traces: NonNullable<PopulationCohortState['lastMigration']>[] = []
  for (const cohort of [...cohorts].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = sourceSettlements.find((settlement) => cohort.cellAllocations.some((allocation) => settlement.regional?.extentCellIds.includes(allocation.cellId)))
    const destination = destinations.find((settlement) => settlement.id !== source?.id && cellById.get(settlement.anchorCellId)?.movementCost)
    if (!source || !destination) continue
    const allocation = cohort.cellAllocations.filter((candidate) => source.regional?.extentCellIds.includes(candidate.cellId)).sort((a, b) => b.populationCount - a.populationCount || a.cellId.localeCompare(b.cellId))[0]
    if (!allocation) continue
    const populationCount = Math.max(1, Math.floor(allocation.populationCount / 20))
    allocation.populationCount -= populationCount
    const existing = cohort.cellAllocations.find((candidate) => candidate.cellId === destination.anchorCellId)
    if (existing) existing.populationCount += populationCount
    else cohort.cellAllocations.push({ cellId: destination.anchorCellId, populationCount })
    cohort.cellAllocations = cohort.cellAllocations.filter((candidate) => candidate.populationCount > 0).sort((a, b) => a.cellId.localeCompare(b.cellId))
    cohort.eventTotals.migrationOut += populationCount
    cohort.eventTotals.migrationIn += populationCount
    const trace = { tick, sourceSettlementId: source.id, destinationSettlementId: destination.id, sourceCellId: allocation.cellId, destinationCellId: destination.anchorCellId, populationCount, reason: 'source settlement contraction and destination housing capacity' }
    cohort.lastMigration = trace; traces.push(trace)
  }
  return traces
}
